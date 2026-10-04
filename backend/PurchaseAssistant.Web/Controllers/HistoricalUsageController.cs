using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.ML;
using System.Data;
using System.Security.Cryptography;
using System.Text.Json;

namespace PurchaseAssistant.Web.Controllers;

public record HistoricalImportRequest(string Csv, string Source, bool ConfirmCompleteDailyTotals, string? PreviewToken = null);

[ApiController, Route("api/v1/ml/history"), Authorize(Policy = "RequireStockView"), Authorize(Roles = "Owner,SuperAdmin"), EnableRateLimiting("ml")]
public class HistoricalUsageController(AppDbContext db, ICurrentUserService user, IDataProtectionProvider protection, TimeProvider clock) : ControllerBase
{
    private Guid Business => user.BusinessId ?? throw new UnauthorizedAccessException();
    private readonly IDataProtector protector = protection.CreateProtector("HistoricalUsage.preview.v1");
    private record Proof(Guid Business, Guid User, string Hash, string Source, DateTime Expires);

    private async Task<HistoricalValidation> Validate(HistoricalImportRequest input, CancellationToken ct)
    {
        if (!input.ConfirmCompleteDailyTotals || string.IsNullOrWhiteSpace(input.Source) || input.Source.Length > 200 || input.Source.Any(char.IsControl))
            throw new ArgumentException("Identify the trusted source and confirm these are complete daily consumption totals with original source timestamps.");
        var result = HistoricalCsv.Validate(input.Csv, Business, clock.GetUtcNow().UtcDateTime);
        var ids = result.Records.Select(x => x.ItemId).Distinct().ToArray();
        var items = await db.CatalogItems.AsNoTracking().Where(x => x.BusinessId == Business && x.IsActive && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DefaultUnit, ct);
        if (ids.Length > 0) {
            var from = result.Records.Min(x => x.Date); var to = result.Records.Max(x => x.Date);
            var existing = await db.HistoricalUsageRows.AsNoTracking().Where(x => x.BusinessId == Business && ids.Contains(x.CatalogItemId) && x.Date >= from && x.Date <= to).Select(x => new { x.CatalogItemId, x.Date }).ToListAsync(ct);
            var current = await db.DailyUsageLogs.AsNoTracking().Where(x => x.BusinessId == Business && ids.Contains(x.CatalogItemId) && x.Date >= from && x.Date <= to && x.IsConfirmed).Select(x => new { x.CatalogItemId, x.Date }).ToListAsync(ct);
            var dates = existing.Concat(current).Select(x => (x.CatalogItemId, x.Date)).ToHashSet();
            foreach (var row in result.Records) {
                if (!items.TryGetValue(row.ItemId, out var unit)) result.Errors.Add(new(row.Row, "Item is unknown, inactive or outside the selected warehouse."));
                else if (row.Unit != unit) result.Errors.Add(new(row.Row, "Unit must exactly match the current item's unit; automatic conversions are not supported."));
                if (dates.Contains((row.ItemId, row.Date))) result.Errors.Add(new(row.Row, "Daily consumption already exists. Resolve corrections separately; imports cannot overwrite history."));
            }
        }
        if (await db.HistoricalUsageBatches.AnyAsync(x => x.BusinessId == Business && x.FileHash == result.Hash, ct)) result.Errors.Add(new(0, "This file has already been imported."));
        return result;
    }
    [HttpPost("preview"), RequestSizeLimit(2_500_000)]
    public async Task<IActionResult> Preview(HistoricalImportRequest input, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        var result = await Validate(input, ct); var valid = result.Errors.Count == 0;
        var token = valid ? protector.Protect(JsonSerializer.Serialize(new Proof(Business, user.UserId!.Value, result.Hash, input.Source, clock.GetUtcNow().UtcDateTime.AddMinutes(15)))) : null;
        return Ok(new { result.TotalRows, ValidRows = result.TotalRows - result.Errors.Where(x => x.Row > 0).Select(x => x.Row).Distinct().Count(), ErrorCount = result.Errors.Count,
            Errors = result.Errors, Sample = result.Records.Take(50), FileHash = result.Hash, CanCommit = valid, PreviewToken = token,
            Message = "Preview only. Import adds historical consumption labels; it never changes current stock or purchases." });
    }
    [HttpPost("commit"), RequestSizeLimit(2_500_000)]
    public async Task<IActionResult> Commit(HistoricalImportRequest input, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        Proof proof;
        try { proof = JsonSerializer.Deserialize<Proof>(protector.Unprotect(input.PreviewToken ?? "")) ?? throw new CryptographicException(); }
        catch (Exception ex) when (ex is CryptographicException or JsonException) { return BadRequest(new { message = "Preview this file again before importing." }); }
        if (proof.Business != Business || proof.User != user.UserId || proof.Source != input.Source || proof.Expires < clock.GetUtcNow().UtcDateTime)
            return BadRequest(new { message = "Preview is expired or belongs to another user/business." });
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
        var result = await Validate(input, ct);
        if (result.Hash != proof.Hash || result.Errors.Count != 0) return Conflict(new { message = "File or warehouse history changed. Nothing was imported; preview again.", result.Errors });
        var batch = new HistoricalUsageBatch { BusinessId = Business, ImportedById = user.UserId!.Value, ImportedAt = clock.GetUtcNow().UtcDateTime,
            Source = input.Source, FileHash = result.Hash, RawCsv = input.Csv, RowCount = result.TotalRows };
        db.HistoricalUsageBatches.Add(batch);
        db.HistoricalUsageRows.AddRange(result.Records.Select(x => new HistoricalUsageRow { BusinessId = Business, BatchId = batch.Id, CatalogItemId = x.ItemId,
            Date = x.Date, Quantity = x.Quantity, Unit = x.Unit, SourceRecordedAt = x.RecordedAt }));
        db.SecurityAuditLogs.Add(new() { BusinessId = Business, UserId = user.UserId.Value, EventType = "HistoricalConsumptionImported", Description = $"HistoricalUsageBatch:{batch.Id}",
            MetadataJson = JsonSerializer.Serialize(new { batch.FileHash, batch.RowCount }), CreatedAt = batch.ImportedAt });
        try { await db.SaveChangesAsync(ct); if (transaction != null) await transaction.CommitAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" or "40001" }) {
            return Conflict(new { message = "History changed during import. Nothing was imported; preview again." });
        }
        return Ok(new { BatchId = batch.Id, ImportedRows = batch.RowCount, batch.FileHash, batch.ImportedAt, StockChanged = false });
    }
}
