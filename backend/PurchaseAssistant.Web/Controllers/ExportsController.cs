using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using System.IO.Compression;
using System.Text.Json;
using System.Globalization;
using System.Text;
namespace PurchaseAssistant.Web.Controllers;
[ApiController, Route("api/v1/exports"), Authorize(Policy = "RequireReportsView"), Authorize(Roles = "Owner,Admin,Manager,SuperAdmin")]
public partial class ExportsController(AppDbContext db, ICurrentUserService user, BusinessBackupService backups, IStockService stockService, IReportService reportService) : ControllerBase
{
    private bool Money => user.Role is "Owner" or "SuperAdmin";
    private Guid Business => user.BusinessId ?? throw new UnauthorizedAccessException("Select a business.");
    private static string Amount(decimal v) => v.ToString("0.00##", CultureInfo.InvariantCulture);
    private static string MoneyAmount(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
    private IEnumerable<string> Totals(IReadOnlyCollection<PurchaseAssistant.Domain.Entities.PurchaseOrder> purchases)
    {
        yield return $"Purchases: {purchases.Count}";
        if (Money) yield return $"Total INR {MoneyAmount(purchases.Sum(x => x.GrandTotal))} | Paid INR {MoneyAmount(purchases.Sum(x => x.PaidAmount))} | Outstanding INR {MoneyAmount(purchases.Sum(x => x.GrandTotal - x.PaidAmount))}";
    }
    private IQueryable<PurchaseAssistant.Domain.Entities.PurchaseOrder> Orders(DateTime? start, DateTime? end)
    {
        start = start.HasValue ? Utc(start.Value) : null; end = end.HasValue ? Utc(end.Value) : null;
        if (start > end) throw new ArgumentException("Invalid date range.");
        if (start.HasValue && end.HasValue && (end.Value - start.Value).TotalDays > 3660) throw new ArgumentException("Choose a period of at most ten years.");
        var q = ReportService.ReportingPurchases(db, Business);
        if (start.HasValue) { var from = start.Value; q = q.Where(x => x.CreatedAt >= from); }
        if (end.HasValue) { var to = end.Value; q = q.Where(x => x.CreatedAt <= to); }
        return q;
    }
    private static DateTime Utc(DateTime value) => value.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(value, DateTimeKind.Utc) : value.ToUniversalTime();
    private static (DateTime? Start, DateTime End) Period(string preset)
    {
        var day = DateTime.UtcNow.Date;
        var start = preset switch { "month" => (DateTime?)new DateTime(day.Year, day.Month, 1, 0, 0, 0, DateTimeKind.Utc), "quarter" => day.AddDays(-89), "all" => null, _ => throw new ArgumentException("Choose month, quarter or all.") };
        return (start, day.AddDays(1).AddTicks(-10));
    }
    private async Task<byte[]> Stock(CancellationToken ct)
    {
        var rows = await db.CatalogItems.AsNoTracking().Where(x => x.BusinessId == user.BusinessId && x.IsActive).OrderBy(x => x.Name)
            .Select(x => new { x.ItemCode, x.Name, Category = x.Category.Name, Subcategory = x.Type == null ? null : x.Type.Name, Supplier = x.LastSupplier == null ? null : x.LastSupplier.Name,
                x.DefaultUnit, x.CurrentStock, x.PhysicalStock, x.ReservedStock, x.ReorderLevel, x.Barcode }).Take(5001).ToListAsync(ct);
        if (rows.Count > 5000) throw new ArgumentException("Stock export is limited to 5,000 items.");
        return ExportFileBuilder.Spreadsheet(["Code", "Item", "Category", "Unit", "System stock", "Physical stock", "Reserved", "Available", "Reorder level", "Subcategory", "Supplier", "Barcode"],
            rows.Select(x => new object?[] { x.ItemCode, x.Name, x.Category, x.DefaultUnit, x.CurrentStock, x.PhysicalStock, x.ReservedStock, x.CurrentStock - x.ReservedStock, x.ReorderLevel, x.Subcategory, x.Supplier, x.Barcode }));
    }
    private async Task<FileStreamResult> Download(byte[] bytes, string mime, string name)
    {
        db.SecurityAuditLogs.Add(new PurchaseAssistant.Domain.Entities.SecurityAuditLog { BusinessId = Business, UserId = user.UserId,
            EventType = "business_export", Description = "Business data export generated.", MetadataJson = JsonSerializer.Serialize(new { format = mime }) });
        await db.SaveChangesAsync(HttpContext.RequestAborted);
        Response.Headers.CacheControl = "private, no-store"; Response.Headers.XContentTypeOptions = "nosniff";
        return File(new MemoryStream(bytes, false), mime, name);
    }
    [HttpGet("stock.xlsx")]
    public async Task<IActionResult> StockFile(CancellationToken ct) => await Download(await Stock(ct), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "harisree_stock_" + DateTime.UtcNow.ToString("yyyy-MM-dd") + ".xlsx");
    private IEnumerable<string> PurchaseRows(PurchaseAssistant.Domain.Entities.PurchaseOrder p)
    {
        yield return p.OrderNumber + " | " + p.CreatedAt.ToString("yyyy-MM-dd") + " | " + p.Supplier.Name + " | " + p.Status;
        foreach (var i in p.Items) yield return i.CatalogItem.Name + " | Qty " + Amount(i.OrderedQuantity) + " | Received " + Amount(i.ReceivedQuantity) + (Money ? " | Unit INR " + MoneyAmount(i.UnitPrice) + " | Total INR " + MoneyAmount(i.LineTotal) : "");
        if (Money) yield return "Total INR " + MoneyAmount(p.GrandTotal) + " | Paid INR " + MoneyAmount(p.PaidAmount) + " | Outstanding INR " + MoneyAmount(p.GrandTotal - p.PaidAmount);
        yield return "";
    }
    [HttpGet("purchases.pdf")]
    public async Task<IActionResult> Purchases(DateTime? start, DateTime? end, CancellationToken ct)
    {
        var monthly = !start.HasValue && !end.HasValue;
        if (monthly) (start, end) = Period("month");
        var definition = ReportDefinitions.Single(x => x.Id == "purchases");
        var filter = new ReportFilter { Start = start, End = end };
        ValidateReportFilter(definition, filter);
        var table = await BuildReport(definition, filter, null!, null!, ct);
        return await Download(ExportFileBuilder.ReportPdf(table, ct), "application/pdf", monthly ? $"harisree_purchases_{DateTime.UtcNow:yyyy-MM}.pdf" : "purchases.pdf");
    }
    [HttpGet("backup.json")]
    public async Task<IActionResult> JsonBackup(DateTime? start, DateTime? end, CancellationToken ct)
    {
        if (!start.HasValue && !end.HasValue) (start, end) = Period("quarter");
        var orders = await Orders(start, end).Include(x => x.Supplier).Include(x => x.Items).ThenInclude(x => x.CatalogItem).OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(2001).ToListAsync(ct);
        var stock = await db.CatalogItems.AsNoTracking().Where(x => x.BusinessId == user.BusinessId && x.IsActive).OrderBy(x => x.Id).Select(x => new { x.Id, x.Name, x.ItemCode, x.DefaultUnit, x.CurrentStock, x.PhysicalStock, x.ReservedStock, x.ReorderLevel }).Take(5001).ToListAsync(ct);
        if (orders.Count > 2000 || stock.Count > 5000) return StatusCode(413, new { message = "Export is too large. Choose a shorter purchase range." });
        var purchases = orders.Select(p => { var row = new Dictionary<string, object?> { ["id"] = p.Id, ["orderNumber"] = p.OrderNumber, ["date"] = p.CreatedAt, ["supplier"] = p.Supplier.Name, ["status"] = p.Status.ToString(),
            ["items"] = p.Items.Select(i => { var line = new Dictionary<string, object?> { ["catalogItemId"] = i.CatalogItemId, ["name"] = i.CatalogItem.Name, ["orderedQuantity"] = i.OrderedQuantity, ["receivedQuantity"] = i.ReceivedQuantity }; if (Money) { line["unitPrice"] = i.UnitPrice; line["lineTotal"] = i.LineTotal; } return line; }).ToArray() };
            if (Money) { row["grandTotal"] = p.GrandTotal; row["paidAmount"] = p.PaidAmount; } return row; }).ToArray();
        var suppliers = await db.Suppliers.AsNoTracking().Where(x => x.BusinessId == user.BusinessId).OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Phone, x.Address }).Take(2001).ToListAsync(ct);
        var movementsQuery = db.StockMovements.AsNoTracking().Where(x => x.BusinessId == user.BusinessId);
        if (start.HasValue) movementsQuery = movementsQuery.Where(x => x.CreatedAt >= start.Value);
        if (end.HasValue) movementsQuery = movementsQuery.Where(x => x.CreatedAt <= end.Value);
        var movements = await movementsQuery.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Select(x => new { x.Id, x.CatalogItemId, x.MovementType, x.QuantityDelta, x.QuantityBefore, x.QuantityAfter, x.CreatedAt }).Take(500).ToListAsync(ct);
        if (suppliers.Count > 2000) return StatusCode(413, new { message = "Supplier export limit exceeded." });
        var backup = new { schemaVersion = 1, businessId = user.BusinessId, exportedAt = DateTime.UtcNow, stock, suppliers, purchases, stockMovements = movements };
        return await Download(JsonSerializer.SerializeToUtf8Bytes(backup), "application/json", "business-backup.json");
    }
    [HttpGet("backup.zip")]
    public async Task<IActionResult> ZipBackup(DateTime? start, DateTime? end, CancellationToken ct)
    {
        if (!start.HasValue && !end.HasValue) (start, end) = Period("month");
        var rows = await Orders(start, end).Include(x => x.Supplier).Include(x => x.Items).ThenInclude(x => x.CatalogItem).OrderByDescending(x => x.CreatedAt).Take(401).ToListAsync(ct);
        if (rows.Count > 400) return StatusCode(413, new { message = "Choose a shorter range (maximum 400 purchases)." });
        if (rows.Count == 0) return NotFound(new { message = "No purchases in this range." });
        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            async Task Add(string path, byte[] bytes) { using var stream = zip.CreateEntry(path).Open(); await stream.WriteAsync(bytes, ct); }
            await Add("purchases_summary.pdf", ExportFileBuilder.Pdf("Purchase summary", rows.SelectMany(PurchaseRows).Concat(Totals(rows))));
            await Add("stock/stock.xlsx", await Stock(ct));
            foreach (var p in rows) await Add($"orders/{p.Id:N}.pdf", ExportFileBuilder.Pdf(p.OrderNumber, PurchaseRows(p)));
            foreach (var group in rows.GroupBy(x => x.SupplierId)) await Add($"ledgers/{group.Key:N}.pdf", ExportFileBuilder.Pdf("Supplier ledger", group.SelectMany(PurchaseRows).Concat(Totals(group.ToList()))));
            var summary = string.Join("\n", Totals(rows)) + "\n";
            await Add("Summary.txt", Encoding.UTF8.GetBytes(summary));
            await Add("README.txt", Encoding.UTF8.GetBytes($"Warehouse Assistant / Harisree Agency\nBusiness: {user.BusinessId}\nRange: {start:yyyy-MM-dd} to {end:yyyy-MM-dd}\nPurchase summary, order PDFs, supplier ledgers and current stock XLSX.\nFinancial values are included only for the business owner.\n"));
        }
        return await Download(output.ToArray(), "application/zip", $"purchase_assistant_backup_{user.BusinessId}_{DateTime.UtcNow:yyyy-MM-dd}.zip");
    }
    public record BackupRequest(string RangePreset = "month");
    [HttpPost("backup")]
    public Task<IActionResult> PresetBackup([FromBody] BackupRequest request, CancellationToken ct)
    { var range = Period(request.RangePreset); return ZipBackup(range.Start, range.End, ct); }
    [HttpGet("backup/logs")]
    public async Task<IActionResult> History(CancellationToken ct) => Ok(new { items = await backups.HistoryAsync(Business, ct) });
    [HttpPost("backup/run")]
    public async Task<IActionResult> Run(CancellationToken ct)
    { var result = await backups.RunAsync(Business, "manual", user.UserId, ct); return result.Status == "success" ? Ok(result) : StatusCode(503, result); }
    [HttpPost("restore/dry-run"), Authorize(Roles = "Owner,SuperAdmin"), RequestSizeLimit(10485760)]
    public IActionResult DryRun([FromBody] JsonElement payload)
    {
        var errors = new List<string>();
        if (payload.ValueKind != JsonValueKind.Object) return BadRequest(new { message = "A backup object is required." });
        if (payload.TryGetProperty("payload", out var inner)) payload = inner;
        if (payload.ValueKind != JsonValueKind.Object) return BadRequest(new { message = "A backup object is required." });
        var stored = payload.TryGetProperty("schema_version", out var sv) && sv.ValueKind == JsonValueKind.String && sv.GetString() == BusinessBackupService.SchemaVersion;
        if (!payload.TryGetProperty(stored ? "business_id" : "businessId", out var business) || business.ValueKind != JsonValueKind.String || !Guid.TryParse(business.GetString(), out var id) || id != user.BusinessId) errors.Add("Backup belongs to another business or has no business ID.");
        if (!stored && (!payload.TryGetProperty("schemaVersion", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var v) || v != 1)) errors.Add("Unsupported backup version.");
        var counts = new Dictionary<string, int>();
        foreach (var key in stored ? new[] { "catalog", "suppliers", "purchases", "stock_audits" } : new[] { "stock", "suppliers", "purchases", "stockMovements" }) { if (!payload.TryGetProperty(key, out var rows) || rows.ValueKind != JsonValueKind.Array) errors.Add($"Missing {key} array."); else counts[key] = rows.GetArrayLength(); }
        return Ok(new { valid = errors.Count == 0, errors, rowCounts = counts, writesPerformed = false, restoreEnabled = false });
    }
    [HttpPost("restore/commit"), Authorize(Roles = "Owner,SuperAdmin")]
    public IActionResult Restore() => StatusCode(501, new { message = "Restore requires an approved production-copy rehearsal and is not enabled." });
}
