using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.Web.Controllers;

namespace PurchaseAssistant.IntegrationTests.Stock;
public partial class StockServiceIntegrationTests
{
    [RequiresDisposablePostgresFact]
    public async Task ReportExport_CompleteUtcDayIncludesPostgresLastMicrosecond()
    {
        var item = await CreateItemAsync(); var date = DateTime.UtcNow.Date;
        _context.Purchases.Add(new() { BusinessId = _businessId, Supplier = new Supplier { BusinessId = _businessId, Name = "Boundary supplier" }, OrderNumber = "BOUNDARY", Status = PurchaseStatus.Completed, CreatedAt = date.AddDays(1).AddTicks(-10), GrandTotal = 99.99m,
            Items = [new PurchaseItem { BusinessId = _businessId, CatalogItemId = item.Id, Unit = "PCS", OrderedQuantity = 1, UnitPrice = 99.99m, LineTotal = 99.99m }] });
        await _context.SaveChangesAsync();
        var user = new ReportUser(_businessId, _userId);
        var controller = new ExportsController(_context, user, new BusinessBackupService(_context, new ConfigurationBuilder().Build(), TimeProvider.System), new StockService(_context, user), new ReportService(_context)) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        var result = Assert.IsType<FileContentResult>(await controller.ReportFile("spend", "csv", new() { Start = date, End = date.AddDays(1).AddTicks(-10) }, new AuthorizedReportPolicy(), new DashboardService(_context, user), null!, default));
        Assert.Contains("99.99", Encoding.UTF8.GetString(result.FileContents));
    }
    [RequiresDisposablePostgresFact]
    public async Task ReportExport_PostgresProjectionsReconcileAndSnapshotReleasesBeforeAuditWrite()
    {
        var item = await CreateItemAsync(current: 12.3456m, physical: 10, reserved: 2); item.ReorderLevel = 20;
        _context.CatalogItems.Update(item); await _context.SaveChangesAsync();
        var supplier = new Supplier { BusinessId = _businessId, Name = "Report supplier" };
        var now = DateTime.UtcNow;
        _context.Purchases.AddRange(
            new PurchaseOrder { BusinessId = _businessId, Supplier = supplier, Status = PurchaseStatus.Completed, OrderNumber = "REPORT-CONFIRMED", CreatedAt = now, GrandTotal = 125.75m, PaidAmount = 25.75m, Items = [new PurchaseItem { BusinessId = _businessId, CatalogItemId = item.Id, Unit = "PCS", OrderedQuantity = 5, ReceivedQuantity = 5, UnitPrice = 25.15m, LineTotal = 125.75m }] },
            new PurchaseOrder { BusinessId = _businessId, Supplier = supplier, Status = PurchaseStatus.Draft, OrderNumber = "EXCLUDED-DRAFT", CreatedAt = now, GrandTotal = 999 },
            new PurchaseOrder { BusinessId = _businessId, Supplier = supplier, Status = PurchaseStatus.Cancelled, OrderNumber = "EXCLUDED-CANCELLED", CreatedAt = now, GrandTotal = 888 });
        await _context.SaveChangesAsync();
        var user = new ReportUser(_businessId, _userId); var reports = new ReportService(_context);
        var controller = new ExportsController(_context, user, new BusinessBackupService(_context, new ConfigurationBuilder().Build(), TimeProvider.System), new StockService(_context, user), reports)
            { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        var dashboard = new DashboardService(_context, user); var policy = new AuthorizedReportPolicy();
        foreach (var report in new[] { "catalog", "stock", "low-stock", "valuation", "purchases", "purchase-summary", "spend", "supplier-purchases", "delivery", "dashboard", "comparison", "movements", "audit", "backup-history", "suppliers", "brokers" })
        {
            var result = Assert.IsType<FileContentResult>(await controller.ReportFile(report, "csv", new(), policy, dashboard, null!, default));
            var text = Encoding.UTF8.GetString(result.FileContents);
            if (report is "purchases" or "supplier-purchases" or "spend") { Assert.Contains("125.75", text); Assert.DoesNotContain("EXCLUDED-DRAFT", text); Assert.DoesNotContain("EXCLUDED-CANCELLED", text); }
            if (report == "delivery") { Assert.Contains("EXCLUDED-DRAFT", text); Assert.Contains("EXCLUDED-CANCELLED", text); }
            if (report == "stock") { Assert.Contains("12.3456", text); Assert.Contains("10.3456", text); }
            Assert.Null(_context.Database.CurrentTransaction);
        }
        var valuation = await reports.GetStockAnalyticsAsync(_businessId); Assert.Equal(12.3456m * (125.75m / 5m), valuation.EstimatedInventoryValue);
        Assert.Equal(16, await _context.SecurityAuditLogs.CountAsync(x => x.EventType == "report_export"));
        Assert.Equal(12.3456m, (await _context.CatalogItems.AsNoTracking().SingleAsync()).CurrentStock);
        Assert.Empty(await _context.StockMovements.ToListAsync());
    }
    private sealed class ReportUser(Guid business, Guid actor) : ICurrentUserService
    {
        public Guid? UserId => actor; public Guid? BusinessId => business; public string Role => "Owner";
        public string Email => "report@test.local"; public IEnumerable<string> Permissions => ["reports.view", "stock.view", "purchase.view"]; public bool HasPermission(string permission) => true;
    }
    // HTTP authentication and actual policy handlers are exercised by ReportExportEndpointTests.
    // Here an already-authorized caller exercises real PostgreSQL projections and transaction behavior.
    private sealed class AuthorizedReportPolicy : IAuthorizationService
    {
        public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource, IEnumerable<IAuthorizationRequirement> requirements) => Task.FromResult(AuthorizationResult.Success());
        public Task<AuthorizationResult> AuthorizeAsync(ClaimsPrincipal user, object? resource, string policyName) => Task.FromResult(AuthorizationResult.Success());
    }
}
