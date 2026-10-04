using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;

namespace PurchaseAssistant.Web.Controllers;

[ApiController, Route("api/v1/ml"), Authorize(Policy = "RequireStockView"), EnableRateLimiting("ml")]
public class MlController(MlService ml, AppDbContext db, ICurrentUserService user) : ControllerBase
{
    [HttpGet("items")]
    public async Task<IActionResult> Items(string? search = null, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        if (page is < 1 or > 10000 || pageSize is < 1 or > 100 || search?.Length > 100) return BadRequest(new { message = "Invalid item filter." });
        var query = db.CatalogItems.AsNoTracking().Where(x => x.BusinessId == user.BusinessId && x.IsActive);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Name.Contains(search) || x.ItemCode.Contains(search));
        var count = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.Name, x.ItemCode, Unit = x.DefaultUnit }).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new { items, totalCount = count, page, pageSize });
    }
    [HttpGet("items/{id:guid}")]
    public async Task<IActionResult> Analyze(Guid id, int horizon = 7, CancellationToken ct = default)
    {
        Response.Headers.CacheControl = "private, no-store";
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try { return Ok(await ml.AnalyzeAsync(id, horizon, timeout.Token)); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return StatusCode(503, new { message = "Forecast request timed out. Please retry." }); }
    }
    [HttpGet("items/{id:guid}/monitoring")]
    public async Task<IActionResult> Monitoring(Guid id, CancellationToken ct) { Response.Headers.CacheControl = "private, no-store"; return Ok(await ml.MonitoringAsync(id, ct)); }
    [HttpGet("items/{id:guid}/monitoring-summary")]
    public async Task<IActionResult> MonitoringSummary(Guid id, CancellationToken ct) { Response.Headers.CacheControl = "private, no-store"; return Ok(await ml.MonitoringSummaryAsync(id, ct)); }
}
