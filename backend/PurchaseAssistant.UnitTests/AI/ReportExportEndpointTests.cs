using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.ML;
using UglyToad.PdfPig;

namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    public static IEnumerable<object[]> BusinessReports => new[] { "catalog", "stock", "valuation", "low-stock", "movements", "audit", "purchases", "purchase-summary", "spend", "suppliers", "supplier-purchases", "brokers", "delivery", "dashboard", "backup-history", "comparison" }
        .SelectMany(id => new[] { "pdf", "csv", "xlsx" }.Select(format => new object[] { id, format }));
    private static string ReadReport(byte[] bytes, string format)
    {
        if (format == "pdf") { using var pdf = PdfDocument.Open(bytes); Assert.NotEmpty(pdf.GetPages()); return string.Join("\n", pdf.GetPages().Select(x => x.Text)); }
        if (format == "csv") return Encoding.UTF8.GetString(bytes);
        using var zip = new ZipArchive(new MemoryStream(bytes)); using var reader = new StreamReader(zip.GetEntry("xl/worksheets/sheet1.xml")!.Open());
        Assert.NotNull(zip.GetEntry("xl/styles.xml")); var xml = reader.ReadToEnd(); Assert.DoesNotContain("<f>", xml); return xml;
    }
    private static async Task<Guid> SeedReportData(Factory factory)
    {
        await SeedExport(factory); await SeedExport(factory, Guid.NewGuid());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var item = await db.CatalogItems.IgnoreQueryFilters().FirstAsync(x => x.BusinessId == BusinessId);
        item.Name = "Café rice ₹ - മലയാളം"; item.ReorderLevel = 10; item.DefaultUnit = "KG";
        db.Brokers.Add(new() { BusinessId = BusinessId, Name = "Local broker" });
        db.BackupLogs.Add(new() { BusinessId = BusinessId, Status = "success", SizeBytes = 12345, DurationMs = 100, FilePath = "SECRET_PATH", ErrorMessage = "SECRET_ERROR" });
        db.SecurityAuditLogs.Add(new() { BusinessId = BusinessId, UserId = UserId, EventType = "stock_adjusted", Description = "SECRET_DESCRIPTION", MetadataJson = "{\"password\":\"SECRET_TOKEN\"}" });
        db.StockMovements.Add(new() { BusinessId = BusinessId, CatalogItem = item, CreatedById = UserId, MovementType = "AdjustmentIncrease", QuantityBefore = 0, QuantityAfter = 1.2345m, QuantityDelta = 1.2345m, Reason = "Confirmed count" });
        await db.SaveChangesAsync(); return item.Id;
    }
    [Theory, MemberData(nameof(BusinessReports))]
    public async Task ReportExport_EmptyDatasetsAreValidInEverySupportedFormat(string report, string format)
    {
        using var factory = new Factory { MemberRole = Role.Owner, RealCsvReports = true, RealDashboard = true }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var response = await client.GetAsync($"/api/v1/exports/reports/files/{report}.{format}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = ReadReport(await response.Content.ReadAsByteArrayAsync(), format);
        if (format == "pdf") Assert.Contains(report is "valuation" or "dashboard" or "comparison" ? "0" : "No matching records.", content);
        if (format == "xlsx") Assert.Contains("<row>", content); // Headings remain present even when there are no data rows.
    }
    [Theory, MemberData(nameof(BusinessReports))]
    public async Task ReportExport_SeparateReportContentIsScopedAndReadOnly(string report, string format)
    {
        using var factory = new Factory { MemberRole = Role.Owner, RealCsvReports = true, RealDashboard = true }; using var client = factory.CreateClient();
        await SeedReportData(factory); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var response = await client.GetAsync($"/api/v1/exports/reports/files/{report}.{format}?businessId={Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var bytes = await response.Content.ReadAsByteArrayAsync(); var content = ReadReport(bytes, format);
        Assert.DoesNotContain("FOREIGN PRIVATE", content); Assert.DoesNotContain("SECRET_", content);
        if (format == "pdf") { Assert.Contains("Endpoint business", content); Assert.Contains("Page 1 of", content); Assert.Contains("UTC", content); }
        if (report == "spend") Assert.Contains(format == "pdf" ? "123.46" : "123.4567", content);
        if (report is "stock" or "low-stock" or "movements") Assert.Contains("1.2345", content);
        if (report == "supplier-purchases") Assert.Contains("100", content);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1.2345m, (await db.CatalogItems.IgnoreQueryFilters().SingleAsync(x => x.BusinessId == BusinessId)).CurrentStock);
        Assert.Single(await db.StockMovements.IgnoreQueryFilters().Where(x => x.BusinessId == BusinessId).ToListAsync());
        var audit = Assert.Single(await db.SecurityAuditLogs.IgnoreQueryFilters().Where(x => x.BusinessId == BusinessId && x.EventType == "report_export").ToListAsync()); Assert.Contains(report, audit.MetadataJson);
        var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR");
        if (qa != null) { Directory.CreateDirectory(qa); await File.WriteAllBytesAsync(Path.Combine(qa, report + "." + format), bytes); }
    }
    [Theory]
    [InlineData(Role.Manager, "spend")] [InlineData(Role.Admin, "valuation")] [InlineData(Role.Manager, "audit")] [InlineData(Role.Owner, "database-backups")]
    public async Task ReportExport_FileFinancialAndDatabasePermissionsAreEnforced(Role role, string report)
    {
        using var factory = new Factory { MemberRole = role, Permission = "reports.view" }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/exports/reports/files/{report}.pdf")).StatusCode);
        Assert.DoesNotContain($"\"id\":\"{report}\"", await client.GetStringAsync("/api/v1/exports/reports"));
    }
    [Theory]
    [InlineData("stock")] [InlineData("purchases")] [InlineData("suppliers")] [InlineData("brokers")]
    public async Task ReportExport_ReportRequiresCurrentResourcePermissionAndAuthentication(string report)
    {
        using var factory = new Factory { MemberRole = Role.Manager, Permission = "reports.view" }; using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/v1/exports/reports/files/{report}.csv")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/exports/reports/files/{report}.csv")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", false));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/exports/reports")).StatusCode);
    }
    [Theory]
    [InlineData("catalog.pdf?start=2026-10-01")] [InlineData("spend.pdf?status=Completed")] [InlineData("purchases.pdf?status=99")]
    [InlineData("spend.pdf?start=2026-10-10&end=2026-10-01")] [InlineData("stock.pdf?actor=11111111-1111-1111-1111-111111111111")]
    [InlineData("forecast.pdf?horizon=999")]
    public async Task ReportExport_UnsupportedAndInvalidFiltersFailClearly(string route)
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var response = await client.GetAsync("/api/v1/exports/reports/files/" + route); Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Contains("message", await response.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task ReportExport_EmptyDateRangeAndStatusFiltersAreAppliedWithoutInventingRecords()
    {
        using var factory = new Factory { MemberRole = Role.Owner, RealCsvReports = true }; using var client = factory.CreateClient(); await SeedReportData(factory);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var empty = await client.GetAsync("/api/v1/exports/reports/files/purchases.pdf?start=2020-01-01&end=2020-01-31");
        Assert.Contains("No matching records.", ReadReport(await empty.Content.ReadAsByteArrayAsync(), "pdf"));
        var filtered = await client.GetAsync("/api/v1/exports/reports/files/purchases.csv?status=Completed"); Assert.DoesNotContain("../unsafe/order", await filtered.Content.ReadAsStringAsync());
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var spend = await client.GetStringAsync($"/api/v1/exports/reports/files/spend.csv?start={today}T00:00:00Z&end={today}T23:59:59.999Z"); Assert.Contains("123.4567", spend);
    }
    [Fact]
    public async Task ReportExport_IndividualPurchasePreservesIdentifiersAndRejectsForeignIds()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient(); await SeedReportData(factory);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var orders = await db.Purchases.IgnoreQueryFilters().ToListAsync(); var local = orders.Single(x => x.BusinessId == BusinessId); var foreign = orders.Single(x => x.BusinessId != BusinessId);
        var result = await client.GetAsync($"/api/v1/exports/reports/files/purchases.pdf?purchaseId={local.Id}&start={local.CreatedAt:O}&end={local.CreatedAt:O}");
        Assert.Equal(HttpStatusCode.OK, result.StatusCode); Assert.Contains("../unsafe/order-0", ReadReport(await result.Content.ReadAsByteArrayAsync(), "pdf"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/exports/reports/files/purchases.pdf?purchaseId={foreign.Id}")).StatusCode);
    }
    [Fact]
    public async Task ReportExport_LargeCatalogReturnsLimitErrorInsteadOfTruncatingAndHistoryIsPersonal()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var category = new Category { BusinessId = BusinessId, Name = "Large" };
            db.CatalogItems.AddRange(Enumerable.Range(0, 5001).Select(i => new CatalogItem { BusinessId = BusinessId, Category = category, ItemCode = "L" + i, Name = "Large " + i }));
            db.SecurityAuditLogs.Add(new() { BusinessId = BusinessId, UserId = Guid.NewGuid(), EventType = "report_export", MetadataJson = "{\"report\":\"PRIVATE_HISTORY\"}" }); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.GetAsync("/api/v1/exports/reports/files/catalog.pdf")).StatusCode);
        Assert.DoesNotContain("PRIVATE_HISTORY", await client.GetStringAsync("/api/v1/exports/reports/history"));
    }
    [Fact]
    public async Task ReportExport_ForecastExportsOnlyAvailableTrainedOutputWithMatchingContent()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient(); var itemId = await SeedReportData(factory);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync($"/api/v1/exports/reports/files/forecast.pdf?itemId={itemId}")).StatusCode);
        var now = DateTime.UtcNow; var today = DateOnly.FromDateTime(now);
        var observations = Enumerable.Range(0, 180).Select(i => { var date = today.AddDays(i - 180); return new UsageObservation(date, 20 + .15 * i + 2 * (int)date.DayOfWeek, true, date.ToDateTime(new TimeOnly(23, 0), DateTimeKind.Utc)); }).ToList();
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.DailyUsageLogs.AddRange(observations.Select(x => new DailyUsageLog { BusinessId = BusinessId, CatalogItemId = itemId, Date = x.Date, UsedQty = (decimal)x.Quantity!.Value, IsConfirmed = true, LoggedAt = x.RecordedAt, LoggedByUserId = UserId })); await db.SaveChangesAsync();
            var artifact = ForecastModel.Train(BusinessId, itemId, "KG", UsageData.Prepare(observations, today, now), now);
            await new ArtifactStore(Path.Combine(factory.BackupDirectory, "models")).SaveAsync(artifact);
        }
        var prediction = await client.GetFromJsonAsync<MlAnalysis>($"/api/v1/ml/items/{itemId}?horizon=7"); Assert.Equal("ready", prediction!.Status);
        foreach (var format in new[] { "pdf", "csv", "xlsx" }) {
            var response = await client.GetAsync($"/api/v1/exports/reports/files/forecast.{format}?itemId={itemId}&horizon=7"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var bytes = await response.Content.ReadAsByteArrayAsync(); var content = ReadReport(bytes, format); Assert.Contains("KG", content); Assert.Contains(prediction.Forecast[0].Quantity.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), content);
            var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR"); if (qa != null) await File.WriteAllBytesAsync(Path.Combine(qa, "forecast." + format), bytes);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/exports/reports/files/forecast.pdf?itemId={Guid.NewGuid()}")).StatusCode);
    }
    [Theory]
    [InlineData("pdf")] [InlineData("csv")] [InlineData("xlsx")]
    public async Task ReportExport_OperatorDatabaseStatusReportOmitsRecoverySecrets(string format)
    {
        using var factory = new Factory { MemberRole = Role.SuperAdmin, DatabaseOperator = true }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.DatabaseBackupJobs.Add(new() { Status = "completed", Kind = "daily", CreatedAt = DateTime.UtcNow, Sha256 = "SECRET_HASH", ErrorCode = "SECRET_PATH" }); await db.SaveChangesAsync(); }
        var response = await client.GetAsync($"/api/v1/exports/reports/files/database-backups.{format}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode); var bytes = await response.Content.ReadAsByteArrayAsync();
        var content = ReadReport(bytes, format); Assert.Contains("daily", content); Assert.Contains("completed", content); Assert.DoesNotContain("SECRET_", content);
        var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR"); if (qa != null) await File.WriteAllBytesAsync(Path.Combine(qa, "database-backups." + format), bytes);
    }
}
