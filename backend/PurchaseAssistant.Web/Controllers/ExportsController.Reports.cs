using System.Data;
using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Services;

namespace PurchaseAssistant.Web.Controllers;

public partial class ExportsController
{
    public record ReportDefinition(string Id, string Title, string Category, string[] Policies,
        bool Financial = false, bool Period = false, string StatusFilter = "none", bool ItemRequired = false);
    private static readonly ReportDefinition[] ReportDefinitions =
    [
        new("catalog", "Inventory and catalog", "Inventory", ["RequireCatalogView"], StatusFilter: "active"),
        new("stock", "Current stock", "Inventory", ["RequireStockView"]),
        new("valuation", "Stock valuation", "Inventory", ["RequireStockView"], Financial: true),
        new("low-stock", "Low-stock and reorder alerts", "Inventory", ["RequireStockView"]),
        new("movements", "Stock movement history", "History", ["RequireStockView"], Period: true),
        new("audit", "Business audit history", "History", [], Financial: true, Period: true),
        new("purchases", "Purchase orders", "Purchases", ["RequirePurchaseView"], Period: true, StatusFilter: "purchase"),
        new("purchase-summary", "Purchase summary", "Purchases", ["RequirePurchaseView"], Financial: true, Period: true),
        new("spend", "Purchase spend", "Purchases", ["RequirePurchaseView"], Financial: true, Period: true),
        new("suppliers", "Supplier directory", "Partners", ["RequireSupplierView"], StatusFilter: "active"),
        new("supplier-purchases", "Supplier purchase balances", "Partners", ["RequireSupplierView", "RequirePurchaseView"], Financial: true, Period: true),
        new("brokers", "Broker directory", "Partners", ["RequireBrokerView"], StatusFilter: "active"),
        new("delivery", "Delivery and purchase lifecycle", "Operations", ["RequirePurchaseView"], Period: true, StatusFilter: "purchase"),
        new("dashboard", "Dashboard operational summary", "Operations", ["RequirePurchaseView", "RequireStockView"]),
        new("backup-history", "Business export history and status", "Operations", [], Period: true),
        new("database-backups", "Database backup status", "Operations", ["RequireDatabaseBackup"], Period: true),
        new("comparison", "Period comparison", "Analytics", ["RequirePurchaseView"], Financial: true, Period: true),
        new("forecast", "Item forecast", "Analytics", ["RequireStockView"], ItemRequired: true)
    ];
    private async Task<bool> MayExport(ReportDefinition definition, IAuthorizationService authorization)
    {
        // File results bypass JSON financial redaction. Preserve the existing export financial role contract.
        if (definition.Financial && !Money) return false;
        foreach (var policy in definition.Policies)
            if (!(await authorization.AuthorizeAsync(User, null, policy)).Succeeded) return false;
        return true;
    }
    [HttpGet("reports")]
    public async Task<IActionResult> ReportCatalog([FromServices] IAuthorizationService authorization)
    {
        var reports = new List<object>();
        foreach (var report in ReportDefinitions)
            if (await MayExport(report, authorization)) reports.Add(new { report.Id, report.Title, report.Category, report.Period, report.StatusFilter, report.ItemRequired, formats = new[] { "pdf", "csv", "xlsx" } });
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new { reports, timezone = "UTC", maxRows = 5000, missingCapabilities = new[] {
            "Historical stock balances and historical valuation are unavailable; stock reports show current saved balances.",
            "Supplier balances use purchase PaidAmount, not a payment-event ledger. Broker commissions are not a separate persisted ledger.",
            "Barcode labels use the existing catalog label printing screen and browser Save as PDF.",
            "Database archive status is restricted to deployment operators in Database backups. Business export history is tenant scoped.",
            "Forecasts require a ready, compatible real model. No estimated or demo output is substituted."
        } });
    }
    public class ReportFilter
    {
        public DateTime? Start { get; set; }
        public DateTime? End { get; set; }
        public string Status { get; set; } = "all";
        public string? Search { get; set; }
        public Guid? CategoryId { get; set; }
        public Guid? SupplierId { get; set; }
        public Guid? ItemId { get; set; }
        public Guid? PurchaseId { get; set; }
        public Guid? Actor { get; set; }
        public string? Action { get; set; }
        public int Horizon { get; set; } = 7;
    }
    [HttpGet("reports/files/{report}.{format}")]
    public async Task<IActionResult> ReportFile(string report, string format, [FromQuery] ReportFilter filter,
        [FromServices] IAuthorizationService authorization, [FromServices] IDashboardService dashboard,
        [FromServices] MlService ml, CancellationToken ct)
    {
        var definition = ReportDefinitions.FirstOrDefault(x => x.Id == report);
        if (definition == null || format is not ("pdf" or "csv" or "xlsx")) return NotFound(new { message = "Report or format is unsupported." });
        if (!await MayExport(definition, authorization)) return Forbid();
        try { ValidateReportFilter(definition, filter); }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        // Multi-query reports use a single consistent database snapshot. In-memory test provider has no transactions.
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct) : null;
        ReportTable table;
        try { table = await BuildReport(definition, filter, dashboard, ml, ct); }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (ForecastUnavailableException e) { return Conflict(new { message = e.Message }); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return StatusCode(503, new { message = "Report preparation timed out. Try a smaller range or retry." }); }
        if (transaction != null) { await transaction.CommitAsync(ct); await transaction.DisposeAsync(); }
        if (table.Rows.Count > 5000 || table.Rows.Any(r => r.Any(c => (Convert.ToString(c, CultureInfo.InvariantCulture)?.Length ?? 0) > 32767)) || table.Rows.Sum(r => r.Sum(c => Convert.ToString(c, CultureInfo.InvariantCulture)?.Length ?? 0)) > 2_000_000)
            return StatusCode(413, new { message = "Narrow the export filters: maximum 5,000 rows and 2 MB of text." });
        byte[] bytes;
        try { bytes = format switch
        {
            "pdf" => ExportFileBuilder.ReportPdf(table, ct),
            "xlsx" => ExportFileBuilder.ReportSpreadsheet(table.Columns, table.Rows, [table.Title, table.BusinessName, $"Generated {table.GeneratedAt:O} UTC", table.Period, ..table.Notes]),
            _ => ExportFileBuilder.Csv(table.Columns.Select(x => x.Label).ToArray(), table.Rows.Select(row => row.Select(c => c is DateTime date ? date.ToString("O", CultureInfo.InvariantCulture) : c is DateOnly day ? day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : c is bool active ? active ? "Active" : "Inactive" : c).ToArray()))
        }; }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        if (bytes.Length > 32 * 1024 * 1024) return StatusCode(413, new { message = "Report is too large. Narrow the filters." });
        var mime = format == "pdf" ? "application/pdf" : format == "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        // Keep a tenant-scoped, content-free history in the existing immutable security audit store.
        db.SecurityAuditLogs.Add(new() { BusinessId = Business, UserId = user.UserId, EventType = "report_export",
            Description = "Report download generated.", MetadataJson = JsonSerializer.Serialize(new { report, format, rowCount = table.Rows.Count }) });
        await db.SaveChangesAsync(ct);
        Response.Headers.CacheControl = "private, no-store"; Response.Headers.XContentTypeOptions = "nosniff";
        return File(bytes, mime, $"warehouse_{report}_{DateTime.UtcNow:yyyy-MM-dd_HHmmss}.{format}");
    }
    [HttpGet("reports/history")]
    public async Task<IActionResult> ReportHistory(CancellationToken ct)
    {
        var entries = await db.SecurityAuditLogs.AsNoTracking().Where(x => x.BusinessId == Business && x.UserId == user.UserId && x.EventType == "report_export")
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(50).ToListAsync(ct);
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new { items = entries.Select(x => new { x.Id, x.CreatedAt, status = "generated", details = JsonSerializer.Deserialize<JsonElement>(x.MetadataJson ?? "{}") }) });
    }
    private static void ValidateReportFilter(ReportDefinition definition, ReportFilter f)
    {
        f.Start = f.Start.HasValue ? Utc(f.Start.Value) : null; f.End = f.End.HasValue ? Utc(f.End.Value) : null;
        if (f.Start > f.End || (f.End.HasValue && f.Start.HasValue && (f.End.Value - f.Start.Value).TotalDays > 3660) || f.Search?.Length > 200 || f.Action?.Length > 100)
            throw new ArgumentException("Check the report filters and choose a period of at most ten years.");
        if (!definition.Period && (f.Start.HasValue || f.End.HasValue)) throw new ArgumentException("This report is a current snapshot and does not accept a date range.");
        if (definition.StatusFilter == "none" && f.Status != "all" || definition.StatusFilter == "active" && f.Status is not ("all" or "active" or "inactive")) throw new ArgumentException("Unsupported status filter for this report.");
        if (definition.StatusFilter == "purchase" && f.Status != "all" && (!Enum.TryParse<PurchaseStatus>(f.Status, false, out var status) || !Enum.IsDefined(status) || char.IsDigit(f.Status[0]))) throw new ArgumentException("Choose a valid purchase status.");
        if (definition.ItemRequired && (!f.ItemId.HasValue || f.Horizon is not (7 or 14 or 30))) throw new ArgumentException("Select an item and a forecast horizon of 7, 14 or 30 days.");
        if (definition.Period) { f.End ??= DateTime.UtcNow; f.Start ??= f.End.Value.AddDays(-30); }
        if (definition.Id == "audit" && (f.End - f.Start)?.TotalDays > 366) throw new ArgumentException("Audit reports accept at most 366 days.");
        if (f.Search != null && definition.Id is not ("catalog" or "stock" or "low-stock" or "suppliers" or "brokers")) throw new ArgumentException("Search is unavailable for this report.");
        if (f.CategoryId.HasValue && definition.Id is not ("catalog" or "stock" or "low-stock")) throw new ArgumentException("Category filter is unavailable for this report.");
        if (f.SupplierId.HasValue && definition.Id is not ("purchases" or "supplier-purchases" or "delivery")) throw new ArgumentException("Supplier filter is unavailable for this report.");
        if (f.PurchaseId.HasValue && definition.Id != "purchases" || f.Actor.HasValue && definition.Id is not ("movements" or "audit") || f.Action != null && definition.Id != "audit" || f.ItemId.HasValue && definition.Id is not ("forecast" or "movements")) throw new ArgumentException("A filter is unsupported for this report.");
    }
    private async Task<ReportTable> BuildReport(ReportDefinition definition, ReportFilter f, IDashboardService dashboard, MlService ml, CancellationToken ct)
    {
        var businessName = await db.Businesses.Where(x => x.Id == Business).Select(x => x.Name).SingleAsync(ct);
        var notes = new List<string>();
        var period = definition.Period ? $"{f.Start:yyyy-MM-dd HH:mm} to {f.End:yyyy-MM-dd HH:mm} UTC (inclusive)" : "Current snapshot";
        if (f.Status != "all") notes.Add("Status: " + f.Status);
        if (f.Search != null) notes.Add("Search: " + f.Search);
        if (f.CategoryId.HasValue) notes.Add("Category: " + f.CategoryId);
        if (f.SupplierId.HasValue) notes.Add("Supplier: " + f.SupplierId);
        if (f.ItemId.HasValue) notes.Add("Item: " + f.ItemId);
        if (f.PurchaseId.HasValue) notes.Add("Purchase: " + f.PurchaseId);
        if (f.Actor.HasValue) notes.Add("Actor: " + f.Actor);
        if (f.Action != null) notes.Add("Action contains: " + f.Action);
        if (Money && (definition.Financial && definition.Id != "audit" || definition.Id is "purchases" or "dashboard")) notes.Add("INR amounts display two decimals; totals sum stored values before display rounding.");
        ReportColumn[] columns = []; List<object?[]> rows = [];
        static ReportColumn C(string label, string format = "text", float weight = 1) => new(label, format, weight);
        void Metrics(params (string Label, object? Value)[] metrics) { columns = [C("Metric", weight: 3), C("Value", "money")]; rows = metrics.Select(x => new object?[] { x.Label, x.Value }).ToList(); }
        var id = definition.Id;
        if (id is "catalog" or "stock")
        {
            var query = db.CatalogItems.AsNoTracking().Where(x => x.BusinessId == Business);
            if (id == "stock" || f.Status == "active") query = query.Where(x => x.IsActive);
            if (f.Status == "inactive") query = query.Where(x => !x.IsActive);
            if (f.CategoryId.HasValue) query = query.Where(x => x.CategoryId == f.CategoryId);
            if (!string.IsNullOrWhiteSpace(f.Search)) query = query.Where(x => x.Name.Contains(f.Search) || x.ItemCode.Contains(f.Search));
            var items = await query.Include(x => x.Category).OrderBy(x => x.Name).ThenBy(x => x.Id).Take(5001).ToListAsync(ct);
            if (id == "catalog") { columns = [C("SKU"), C("Item", weight: 2.5f), C("Category"), C("Unit"), C("Barcode", weight: 1.5f), C("Status")]; rows = items.Select(x => new object?[] { x.ItemCode, x.Name, x.Category.Name, x.DefaultUnit, x.Barcode, x.IsActive }).ToList(); }
            else { columns = [C("SKU"), C("Item", weight: 2.5f), C("Unit"), C("System"), C("Physical"), C("Reserved"), C("Available"), C("Reorder")]; rows = items.Select(x => new object?[] { x.ItemCode, x.Name, x.DefaultUnit, x.CurrentStock, x.PhysicalStock, x.ReservedStock, x.CurrentStock - x.ReservedStock, x.ReorderLevel }).ToList(); }
            notes.Add(id == "catalog" ? "Saved catalog identifiers; blank barcodes remain unassigned." : "Active items; current balances, not balances at the selected historical date. Mixed units are not summed.");
        }
        else if (id == "low-stock")
        {
            var items = await stockService.GetCsvRowsAsync("low-stock", f.Search, null, null, null, ct, f.CategoryId);
            columns = [C("Item", weight: 2.5f), C("Unit"), C("System"), C("Physical"), C("Reorder"), C("Supplier", weight: 2)];
            rows = items.Select(x => new object?[] { x.Name, x.Unit, x.Current, x.Physical, x.Reorder, x.Supplier }).ToList();
            notes.Add("Active items with available stock > 0 and <= reorder level, matching the stock screen. Out-of-stock items are excluded. Mixed units are not summed.");
        }
        else if (id == "valuation")
        {
            var value = await reportService.GetStockAnalyticsAsync(Business);
            Metrics(("Catalog items (including inactive)", value.TotalCatalogItems), ("Low-stock items", value.LowStockCount), ("Out-of-stock items", value.OutOfStockCount), ("Estimated inventory value INR", value.EstimatedInventoryValue), ("Unpriced stock items", value.UnpricedStockItemCount), ("Stock movements", value.TotalMovementsCount));
            notes.Add("Same valuation as Reports: current stock x latest non-Draft/non-Cancelled purchase line cost per ordered unit. Unpriced items contribute no value; no fallback cost is invented.");
        }
        else if (id is "purchases" or "supplier-purchases" or "delivery")
        {
            // Lifecycle includes drafts and cancellations; financial reporting eligibility is explicit.
            var query = id == "delivery" || f.PurchaseId.HasValue ? db.Purchases.AsNoTracking().Where(x => x.BusinessId == Business) : Orders(f.Start, f.End);
            query = query.Where(x => x.CreatedAt >= f.Start && x.CreatedAt <= f.End);
            if (f.Status != "all") { var status = Enum.Parse<PurchaseStatus>(f.Status); query = query.Where(x => x.Status == status); }
            if (f.SupplierId.HasValue) query = query.Where(x => x.SupplierId == f.SupplierId);
            if (f.PurchaseId.HasValue) query = query.Where(x => x.Id == f.PurchaseId);
            var orderIds = await query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Select(x => x.Id).Take(2001).ToListAsync(ct);
            if (orderIds.Count > 2000 || await db.PurchaseItems.Where(x => x.BusinessId == Business && orderIds.Contains(x.PurchaseOrderId)).Take(5001).CountAsync(ct) > 5000) throw new ArgumentException("Narrow the range to 2,000 orders and 5,000 purchase lines.");
            var orders = await query.Include(x => x.Supplier).Include(x => x.Items).ThenInclude(x => x.CatalogItem).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(2001).ToListAsync(ct);
            if (orders.Count > 2000) throw new ArgumentException("Choose at most 2,000 purchases.");
            if (f.PurchaseId.HasValue && orders.Count == 0) throw new KeyNotFoundException("Purchase not found in this range.");
            if (id == "delivery") { columns = [C("Order"), C("Supplier", weight: 2), C("Status"), C("Created UTC"), C("Confirmed UTC"), C("Dispatched UTC"), C("Arrived UTC"), C("Verified UTC"), C("Completed UTC")]; rows = orders.Select(x => new object?[] { x.OrderNumber, x.Supplier.Name, x.Status.ToString(), x.CreatedAt, x.ConfirmedAt, x.DispatchedAt, x.ArrivedAt, x.VerifiedAt, x.CompletedAt }).ToList(); }
            else if (id == "supplier-purchases") { columns = [C("Order"), C("Created UTC"), C("Supplier", weight: 2), C("Status"), C("Total INR", "money"), C("Paid INR", "money"), C("Outstanding INR", "money")]; rows = orders.Select(x => new object?[] { x.OrderNumber, x.CreatedAt, x.Supplier.Name, x.Status.ToString(), x.GrandTotal, x.PaidAmount, x.GrandTotal - x.PaidAmount }).ToList(); }
            else
            {
                columns = [C("Order"), C("Created UTC"), C("Supplier", weight: 1.5f), C("Status"), C("Item", weight: 2.5f), C("Unit"), C("Ordered"), C("Received")];
                if (Money) columns = [..columns, C("Line total INR", "money")];
                foreach (var order in orders) foreach (var line in order.Items.OrderBy(x => x.Id)) { object?[] row = [order.OrderNumber, order.CreatedAt, order.Supplier.Name, order.Status.ToString(), line.CatalogItem.Name, line.Unit, line.OrderedQuantity, line.ReceivedQuantity]; rows.Add(Money ? [..row, line.LineTotal] : row); if (rows.Count > 5000) throw new ArgumentException("Choose at most 5,000 purchase lines."); }
            }
            notes.Add(id == "delivery" ? "Lifecycle of saved purchases, including Draft and Cancelled. Missing timestamps are unavailable." : f.PurchaseId.HasValue ? "Individual saved purchase, including its actual status. Line totals are separate from header charges." : "Reporting eligibility excludes Draft and Cancelled. Lines retain their saved units; mixed units are not summed.");
            if (Money && id != "delivery") notes.Add($"Orders {orders.Count}; Total INR {MoneyAmount(orders.Sum(x => x.GrandTotal))}; Paid INR {MoneyAmount(orders.Sum(x => x.PaidAmount))}; Outstanding INR {MoneyAmount(orders.Sum(x => x.GrandTotal - x.PaidAmount))}. Header totals include saved discounts and charges.");
        }
        else if (id is "purchase-summary" or "spend" or "comparison")
        {
            // Bound inputs before invoking existing services which materialize purchase lines.
            if (await Orders(f.Start, f.End).Take(2001).CountAsync(ct) > 2000 || await db.PurchaseItems.Where(x => x.BusinessId == Business && x.PurchaseOrder.CreatedAt >= f.Start && x.PurchaseOrder.CreatedAt <= f.End).Take(5001).CountAsync(ct) > 5000) throw new ArgumentException("Narrow the range to 2,000 orders and 5,000 lines.");
            if (id == "purchase-summary")
            {
                var summary = await reportService.GetPurchaseSummaryAsync(Business, f.Start!.Value, f.End!.Value);
                columns = [C("Grouping"), C("Name", weight: 3), C("Purchases"), C("Spend INR", "money")];
                foreach (var (label, values) in new[] { ("Supplier", summary.BySupplier), ("Category", summary.ByCategory), ("Status", summary.ByStatus) }) rows.AddRange(values.Select(x => new object?[] { label, x.Key, x.Count, x.TotalSpend }));
                notes.Add("Same summary as Reports. Supplier/status amounts use order GrandTotal; category amounts use line totals and exclude header charges. Category purchase counts may overlap; do not sum across groupings.");
            }
            else if (id == "spend")
            {
                var spend = await reportService.GetSpendAnalyticsAsync(Business, f.Start!.Value, f.End!.Value, "day");
                columns = [C("Period (UTC)", weight: 2), C("Purchases"), C("Spend INR", "money")]; rows = spend.Select(x => new object?[] { x.PeriodLabel, x.PurchaseCount, x.TotalSpend }).ToList();
                notes.Add($"Daily spend matches Reports; Draft and Cancelled excluded. Purchases {spend.Sum(x => x.PurchaseCount)}; Total INR {MoneyAmount(spend.Sum(x => x.TotalSpend))}.");
            }
            else
            {
                var priorStart = f.Start!.Value - (f.End!.Value - f.Start.Value);
                if (await Orders(priorStart, f.Start).Take(2001).CountAsync(ct) > 2000) throw new ArgumentException("Narrow the previous period to 2,000 purchases.");
                var comparison = await reportService.GetPeriodComparisonAsync(Business, f.Start.Value, f.End.Value);
                columns = [C("Metric", weight: 2), C("Current", "money"), C("Previous", "money"), C("Change %")];
                rows = [["Spend INR", comparison.CurrentPeriodSpend, comparison.PreviousPeriodSpend, comparison.SpendChangePercentage], ["Purchases", comparison.CurrentPeriodOrders, comparison.PreviousPeriodOrders, comparison.OrdersChangePercentage], ["Average order INR", comparison.CurrentPeriodAvgOrderValue, comparison.PreviousPeriodAvgOrderValue, comparison.AvgOrderValueChangePercentage]];
                notes.Add($"Previous period {comparison.PreviousStartDate:yyyy-MM-dd HH:mm} UTC to {comparison.PreviousEndDate:yyyy-MM-dd HH:mm} UTC (end exclusive); same comparison and zero-baseline convention as Reports.");
            }
        }
        else if (id is "suppliers" or "brokers")
        {
            columns = id == "suppliers" ? [C("Supplier", weight: 3), C("Phone"), C("Address", weight: 3), C("Status")] : [C("Broker", weight: 3), C("Status")];
            if (id == "suppliers") { var query = db.Suppliers.AsNoTracking().Where(x => x.BusinessId == Business); if (f.Status != "all") query = query.Where(x => x.IsActive == (f.Status == "active")); if (f.Search != null) query = query.Where(x => x.Name.Contains(f.Search)); rows = (await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.Name, x.Phone, x.Address, x.IsActive }).ToList(); }
            else { var query = db.Brokers.AsNoTracking().Where(x => x.BusinessId == Business); if (f.Status != "all") query = query.Where(x => x.IsActive == (f.Status == "active")); if (f.Search != null) query = query.Where(x => x.Name.Contains(f.Search)); rows = (await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.Name, x.IsActive }).ToList(); }
        }
        else if (id == "movements")
        {
            var query = db.StockMovements.AsNoTracking().Where(x => x.BusinessId == Business && x.CreatedAt >= f.Start && x.CreatedAt <= f.End);
            if (f.ItemId.HasValue) query = query.Where(x => x.CatalogItemId == f.ItemId); if (f.Actor.HasValue) query = query.Where(x => x.CreatedById == f.Actor);
            columns = [C("Timestamp UTC"), C("Item", weight: 2), C("Type"), C("Change"), C("Before"), C("After"), C("Actor", weight: 1.5f), C("Reason", weight: 2)];
            rows = (await query.Include(x => x.CatalogItem).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.CreatedAt, x.CatalogItem.Name + " (" + x.CatalogItem.DefaultUnit + ")", x.MovementType.ToString(), x.QuantityDelta, x.QuantityBefore, x.QuantityAfter, x.CreatedById, x.Reason }).ToList();
        }
        else if (id == "audit")
        {
            var query = db.SecurityAuditLogs.AsNoTracking().Where(x => x.BusinessId == Business && x.CreatedAt >= f.Start && x.CreatedAt <= f.End);
            if (f.Actor.HasValue) query = query.Where(x => x.UserId == f.Actor); if (f.Action != null) query = query.Where(x => x.EventType.Contains(f.Action));
            columns = [C("Timestamp UTC"), C("Actor", weight: 2), C("Action", weight: 2)];
            rows = (await query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.CreatedAt, x.UserId, x.EventType }).ToList();
            notes.Add("Audit event index. Raw descriptions and metadata are excluded to protect credentials, personal details and provider payloads.");
        }
        else if (id == "backup-history")
        {
            columns = [C("Timestamp UTC"), C("Run type"), C("Status"), C("Bytes"), C("Duration ms")];
            rows = (await db.BackupLogs.AsNoTracking().Where(x => x.BusinessId == Business && x.CreatedAt >= f.Start && x.CreatedAt <= f.End).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.CreatedAt, x.RunType, x.Status, x.SizeBytes, x.DurationMs }).ToList();
            notes.Add("Tenant business JSON export runs; these are not database recovery archives. Paths, errors, secrets and archive contents are excluded.");
        }
        else if (id == "database-backups")
        {
            businessName += " - platform recovery across all businesses";
            // Only reached after the existing deployment-operator policy succeeds. No archive identifiers or secrets.
            columns = [C("Created UTC"), C("Kind"), C("Status"), C("Completed UTC"), C("Bytes"), C("Verified UTC"), C("Offsite verified")];
            rows = (await db.DatabaseBackupJobs.AsNoTracking().Where(x => x.CreatedAt >= f.Start && x.CreatedAt <= f.End).OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(5001).ToListAsync(ct)).Select(x => new object?[] { x.CreatedAt, x.Kind, x.Status, x.CompletedAt, x.SizeBytes, x.VerifiedAt, x.OffsiteVerified ? "Yes" : "No" }).ToList();
            notes.Add("Platform database archive status; deployment operators only. No tenant records, paths, keys, errors, hashes or archive content. Failed/queued jobs may have no completion or verification time.");
        }
        else if (id == "dashboard")
        {
            var value = await dashboard.GetDashboardDataAsync();
            Metrics(("Purchases today (UTC)", value.PurchaseMetrics.TodayPurchasesCount), ("Pending purchases", value.PurchaseMetrics.PendingPurchasesCount), ("Active purchases", value.PurchaseMetrics.ActivePurchasesCount), ("Completed purchases", value.PurchaseMetrics.CompletedPurchasesCount), ("Active catalog items", value.StockMetrics.TotalCatalogItems), ("Low-stock items", value.StockMetrics.LowStockCount), ("Out-of-stock items", value.StockMetrics.OutOfStockCount), ("Physical stock variances", value.StockMetrics.ItermsWithPhysicalVariance), ("Draft deliveries", value.DeliveryMetrics.DraftPurchases), ("Confirmed deliveries", value.DeliveryMetrics.ConfirmedPurchases), ("Dispatched deliveries", value.DeliveryMetrics.DispatchedPurchases), ("Arrived deliveries", value.DeliveryMetrics.ArrivedPurchases), ("Verification pending", value.DeliveryMetrics.VerificationPending));
            if (Money) rows.Add(["Total reporting purchase spend INR", value.PurchaseMetrics.TotalPurchaseSpend]);
            notes.Add("Current metrics from the existing dashboard service. Counts use its lifecycle rules; purchase spend excludes Draft and Cancelled.");
        }
        else if (id == "forecast")
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(15));
            var value = await ml.AnalyzeAsync(f.ItemId!.Value, f.Horizon, timeout.Token);
            if (value.Status != "ready") throw new ForecastUnavailableException(value.Message);
            columns = [C("Date (UTC)"), C("Item", weight: 2), C("Unit"), C("Forecast"), C("Lower scenario"), C("Upper scenario")];
            rows = value.Forecast.Select(x => new object?[] { x.Date, value.ItemName, value.Unit, x.Quantity, x.Lower, x.Upper }).ToList();
            notes.Add($"Model {value.ModelVersion}; trained {value.TrainedAt:yyyy-MM-dd HH:mm} UTC; horizon {f.Horizon} days. Predictions and scenario bounds are uncertain; not actual usage.");
        }
        return new(definition.Title, businessName, DateTime.UtcNow, period, columns, rows, notes.ToArray());
    }
    private sealed class ForecastUnavailableException(string message) : Exception(message);
}
