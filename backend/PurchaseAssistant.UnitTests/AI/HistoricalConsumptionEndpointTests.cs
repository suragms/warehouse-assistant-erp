using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.ML;

namespace PurchaseAssistant.UnitTests.AI;

public partial class PurchaseIntentEndpointTests
{
    private sealed class ImportTestTenant : PurchaseAssistant.Application.Interfaces.ITenantProvider { public Guid GetBusinessId() => BusinessId; }
    private static string ImportCsv(Guid item, string unit = "PCS", Guid? business = null, Guid? warehouse = null)
    {
        var date = DateTime.UtcNow.Date.AddDays(-1);
        return HistoricalCsv.Header + $"\n{business ?? BusinessId},{warehouse ?? BusinessId},{item},{date:yyyy-MM-dd},2.5,{unit},consumption_daily_total,{date:yyyy-MM-dd}T23:00:00Z\n";
    }
    [Theory] [InlineData(Role.Staff)] [InlineData(Role.Admin)] [InlineData(Role.Manager)]
    public async Task HistoricalConsumptionImportIsOwnerOnlyEvenWithForgedClaims(Role role)
    {
        using var factory = new Factory { Permission = "stock.view", MemberRole = role }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        foreach (var path in new[] { "preview", "commit" }) Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/ml/history/" + path, new { csv = "data", source = "trusted", confirmCompleteDailyTotals = true })).StatusCode);
    }
    [Fact] public async Task HistoricalPreviewCommitAndReimportDoNotMutateStockAndKeepProvenance()
    {
        using var factory = new Factory { Permission = "stock.view", MemberRole = Role.Owner }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var item = new CatalogItem { BusinessId = BusinessId, Name = "Historical", ItemCode = "HIST", DefaultUnit = "PCS", CurrentStock = 100 };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.CatalogItems.Add(item); await db.SaveChangesAsync(); }
        var csv = ImportCsv(item.Id); var request = new { csv, source = "Attested daily ledger", confirmCompleteDailyTotals = true };
        var response = await client.PostAsJsonAsync("/api/v1/ml/history/preview", request); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.True(preview.GetProperty("canCommit").GetBoolean());
        using (var scope = factory.Services.CreateScope()) Assert.Empty(scope.ServiceProvider.GetRequiredService<AppDbContext>().HistoricalUsageRows.IgnoreQueryFilters());
        var token = preview.GetProperty("previewToken").GetString();
        var commit = new { csv, source = request.source, confirmCompleteDailyTotals = true, previewToken = token };
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/ml/history/commit", commit)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/ml/history/commit", commit)).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); Assert.Equal(100, (await db.CatalogItems.IgnoreQueryFilters().SingleAsync(x => x.Id == item.Id)).CurrentStock);
            var batch = Assert.Single(db.HistoricalUsageBatches.IgnoreQueryFilters()); var row = Assert.Single(db.HistoricalUsageRows.IgnoreQueryFilters()); Assert.Equal(csv, batch.RawCsv); Assert.True(batch.ImportedAt > row.SourceRecordedAt);
            Assert.Contains(db.SecurityAuditLogs.IgnoreQueryFilters(), x => x.EventType == "HistoricalConsumptionImported");
            var now = DateTime.UtcNow; await using var scoped = new AppDbContext(scope.ServiceProvider.GetRequiredService<DbContextOptions<AppDbContext>>(), new ImportTestTenant()); var observations = await UsageObservationReader.ReadAsync(scoped, BusinessId, new Dictionary<Guid, string> { [item.Id] = "PCS" }, DateOnly.FromDateTime(now).AddDays(-730), DateOnly.FromDateTime(now));
            Assert.Single(UsageData.Prepare(observations[item.Id], DateOnly.FromDateTime(now), now).Series);
            row.Quantity = 999; await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }
    }
    [Theory] [InlineData("foreign-business")] [InlineData("foreign-warehouse")] [InlineData("unknown-item")] [InlineData("wrong-unit")] [InlineData("no-attestation")]
    public async Task HistoricalConsumptionRejectsInvalidRowsWithoutPartialWrites(string kind)
    {
        using var factory = new Factory { Permission = "stock.view", MemberRole = Role.Owner }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var item = new CatalogItem { BusinessId = BusinessId, Name = "Local", ItemCode = "LOCAL", DefaultUnit = "PCS" };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Add(item); await db.SaveChangesAsync(); }
        var csv = ImportCsv(kind == "unknown-item" ? Guid.NewGuid() : item.Id, kind == "wrong-unit" ? "KG" : "PCS", kind == "foreign-business" ? Guid.NewGuid() : null, kind == "foreign-warehouse" ? Guid.NewGuid() : null);
        var response = await client.PostAsJsonAsync("/api/v1/ml/history/preview", new { csv, source = "trusted", confirmCompleteDailyTotals = kind != "no-attestation" });
        if (kind == "no-attestation") Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        else { var result = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.False(result.GetProperty("canCommit").GetBoolean()); Assert.True(result.GetProperty("errorCount").GetInt32() > 0); }
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/ml/history/commit", new { csv, source = "trusted", confirmCompleteDailyTotals = true, previewToken = "forged" })).StatusCode);
        using var check = factory.Services.CreateScope(); Assert.Empty(check.ServiceProvider.GetRequiredService<AppDbContext>().HistoricalUsageRows.IgnoreQueryFilters());
    }
    [Fact] public async Task HistoricalPreviewIsBoundToFileAndCannotOverrideDailyOperations()
    {
        using var factory = new Factory { Permission = "stock.view", MemberRole = Role.Owner }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var item = new CatalogItem { BusinessId = BusinessId, Name = "Local", ItemCode = "LOCAL", DefaultUnit = "PCS" };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Add(item); await db.SaveChangesAsync(); }
        var csv = ImportCsv(item.Id); var response = await client.PostAsJsonAsync("/api/v1/ml/history/preview", new { csv, source = "trusted", confirmCompleteDailyTotals = true });
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>(); var token = preview.GetProperty("previewToken").GetString();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/ml/history/commit", new { csv = csv.Replace(",2.5,", ",7,"), source = "trusted", confirmCompleteDailyTotals = true, previewToken = token })).StatusCode);
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.DailyUsageLogs.Add(new() { BusinessId = BusinessId, CatalogItemId = item.Id, Date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1), UsedQty = 5, IsConfirmed = true }); await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/ml/history/commit", new { csv, source = "trusted", confirmCompleteDailyTotals = true, previewToken = token })).StatusCode);
        using var check = factory.Services.CreateScope(); Assert.Empty(check.ServiceProvider.GetRequiredService<AppDbContext>().HistoricalUsageBatches.IgnoreQueryFilters());
    }
}
