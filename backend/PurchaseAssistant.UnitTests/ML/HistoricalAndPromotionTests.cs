using PurchaseAssistant.ML;
using Xunit;

namespace PurchaseAssistant.UnitTests.ML;

public class HistoricalAndPromotionTests
{
    private static readonly Guid Business = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Item = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static string Csv(string date = "2026-10-02", string quantity = "2.5000", string type = "consumption_daily_total", string timestamp = "2026-10-02T23:00:00Z", string? tenant = null, string? warehouse = null) =>
        HistoricalCsv.Header + $"\n{tenant ?? Business.ToString()},{warehouse ?? Business.ToString()},{Item},{date},{quantity},PCS,{type},{timestamp}\n";
    [Fact] public void ValidDailyTotalsNormalizeDeterministicallyAndKeepOriginalObservationTime()
    {
        var a = HistoricalCsv.Validate(Csv(), Business, ForecastTests.Now); var b = HistoricalCsv.Validate(Csv(), Business, ForecastTests.Now);
        Assert.Empty(a.Errors); Assert.Equal(a.Hash, b.Hash); Assert.Equal(2.5m, Assert.Single(a.Records).Quantity);
        Assert.Equal(DateTimeKind.Utc, a.Records[0].RecordedAt.Kind);
        Assert.Single(UsageData.Prepare(a.Records.Select(r => new UsageObservation(r.Date, (double)r.Quantity, true, r.RecordedAt)), ForecastTests.Today, ForecastTests.Now).Series);
    }
    [Theory] [InlineData("purchase")] [InlineData("stock_adjustment")] [InlineData("snapshot")] [InlineData("sale")]
    public void OtherTransactionsCannotManufactureConsumption(string type) => Assert.NotEmpty(HistoricalCsv.Validate(Csv(type: type), Business, ForecastTests.Now).Errors);
    [Theory] [InlineData("-1")] [InlineData("NaN")] [InlineData("1e3")] [InlineData("1.00001")] [InlineData("1000000001")]
    public void BadQuantitiesRejected(string value) => Assert.NotEmpty(HistoricalCsv.Validate(Csv(quantity: value), Business, ForecastTests.Now).Errors);
    [Theory] [InlineData("10/02/2026")] [InlineData("2026-10-03")] [InlineData("2023-01-01")]
    public void InvalidFutureAndOldDatesRejected(string date) => Assert.NotEmpty(HistoricalCsv.Validate(Csv(date: date), Business, ForecastTests.Now).Errors);
    [Fact] public void ForeignBusinessAndWarehouseRejected()
    {
        Assert.NotEmpty(HistoricalCsv.Validate(Csv(tenant: Guid.NewGuid().ToString()), Business, ForecastTests.Now).Errors);
        Assert.NotEmpty(HistoricalCsv.Validate(Csv(warehouse: Guid.NewGuid().ToString()), Business, ForecastTests.Now).Errors);
    }
    [Fact] public void LateSourceCorrectionsDuplicatesAndMalformedCsvRejected()
    {
        Assert.NotEmpty(HistoricalCsv.Validate(Csv(timestamp: "2026-10-03T00:00:00Z"), Business, ForecastTests.Now).Errors);
        var repeated = Csv() + Csv().Split('\n')[1] + "\n"; Assert.NotEmpty(HistoricalCsv.Validate(repeated, Business, ForecastTests.Now).Errors);
        Assert.Throws<ArgumentException>(() => HistoricalCsv.Validate("\"unclosed", Business, ForecastTests.Now));
        Assert.Throws<ArgumentException>(() => HistoricalCsv.Validate(new string('x', HistoricalCsv.MaxBytes + 1), Business, ForecastTests.Now));
    }
    [Fact] public void PromotionRequiresQualityCodeAndUntouchedChronologicalDates()
    {
        var candidate = ForecastTests.Train() with { CodeVersion = "verified-code-hash" };
        Assert.True(ModelPromotion.Evaluate(candidate, null).Allowed);
        Assert.False(ModelPromotion.Evaluate(candidate with { CodeVersion = "legacy-unrecorded" }, null).Allowed);
        var changed = ForecastTests.Train(ForecastTests.Observations().Select(r => r with { Quantity = r.Quantity + 1 }).ToList()) with { CodeVersion = "verified-code-hash" };
        var decision = ModelPromotion.Evaluate(changed, candidate); Assert.False(decision.Allowed); Assert.Contains("evaluation dates", decision.Reason);
    }
    [Fact] public async Task TrainingDoesNotOverwriteAndPromotionUsesExpectedVersion()
    {
        var root = Path.Combine(Path.GetTempPath(), "wa-phase4-promotion-" + Guid.NewGuid().ToString("N"));
        try {
            var store = new ArtifactStore(root); var candidate = ForecastTests.Train() with { CodeVersion = "verified-code-hash" };
            Assert.True((await store.PromoteAsync(candidate, "none")).Allowed);
            await Assert.ThrowsAsync<IOException>(() => store.SaveAsync(candidate));
            await Assert.ThrowsAsync<InvalidOperationException>(() => store.PromoteAsync(candidate, "none"));
            Assert.Equal(candidate.Version, (await store.LoadAsync(Business, Item))!.Version);
            Assert.Single(Directory.GetFiles(root, "*.promotion-*.json", SearchOption.AllDirectories));
            await Assert.ThrowsAsync<ArgumentException>(() => store.RollbackAsync(Business, Item, candidate.Version, Path.Combine(root, "foreign.json")));
        } finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
    [Fact] public async Task ImprovedUntouchedCandidatePreservesValidatedRollback()
    {
        var root = Path.Combine(Path.GetTempPath(), "wa-phase4-promotion-" + Guid.NewGuid().ToString("N"));
        try {
            var rows = ForecastTests.Observations(240); var early = rows.Take(180).ToList(); var earlyNow = early[^1].RecordedAt.AddDays(1);
            var earlyData = UsageData.Prepare(early, DateOnly.FromDateTime(earlyNow), earlyNow);
            var current = ForecastModel.Train(Business, Item, "PCS", earlyData, earlyNow) with { CodeVersion = "old-code" };
            // A legitimately fitted seasonal baseline is deliberately the incumbent for this algorithm-comparison fixture.
            current = current with { Model = ForecastModel.Fit("seasonal7", current.TrainingHistory), Version = current.DatasetVersion + "-" + current.FeatureVersion + "-seasonal7" };
            var candidate = ForecastModel.Train(Business, Item, "PCS", UsageData.Prepare(rows, ForecastTests.Today, ForecastTests.Now), ForecastTests.Now) with { CodeVersion = "new-code" };
            var store = new ArtifactStore(root); await store.SaveAsync(current);
            var decision = await store.PromoteAsync(candidate, current.Version); Assert.True(decision.Allowed); Assert.NotNull(decision.CurrentTest);
            var backup = Assert.Single(Directory.GetFiles(root, "*.rollback-*.json", SearchOption.AllDirectories));
            await store.RollbackAsync(Business, Item, candidate.Version, backup); Assert.Equal(current.Version, (await store.LoadAsync(Business, Item))!.Version);
        } finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
