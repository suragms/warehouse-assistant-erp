using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.ML;

namespace PurchaseAssistant.IntegrationTests.Stock;

public partial class StockServiceIntegrationTests
{
    private HistoricalUsageBatch NewHistoricalBatch() => new() { BusinessId = _businessId, ImportedById = _userId, ImportedAt = DateTime.UtcNow, Source = "SYNTHETIC INTEGRATION FIXTURE ONLY", FileHash = Guid.NewGuid().ToString("N").PadRight(64, '0'), RawCsv = "SYNTHETIC INTEGRATION FIXTURE ONLY", RowCount = 1 };
    private HistoricalUsageRow HistoricalRow(HistoricalUsageBatch batch, CatalogItem item, int ago = 1) {
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-ago);
        return new() { BusinessId = _businessId, BatchId = batch.Id, CatalogItemId = item.Id, Date = date, Quantity = 10, Unit = item.DefaultUnit, SourceRecordedAt = date.ToDateTime(new TimeOnly(23, 0), DateTimeKind.Utc) };
    }
    [RequiresDisposablePostgresFact]
    public async Task ImportedConsumptionPersistsWithoutStockMutationAndUsesOriginalSourceTime()
    {
        var item = await CreateItemAsync(current: 100); var batch = NewHistoricalBatch(); var row = HistoricalRow(batch, item);
        _context.AddRange(batch, row); await _context.SaveChangesAsync(); _context.ChangeTracker.Clear();
        Assert.Equal(100, (await _context.CatalogItems.SingleAsync(x => x.Id == item.Id)).CurrentStock);
        Assert.True((await _context.HistoricalUsageBatches.SingleAsync()).ImportedAt > (await _context.HistoricalUsageRows.SingleAsync()).SourceRecordedAt);
        var today = DateOnly.FromDateTime(DateTime.UtcNow); var observations = (await UsageObservationReader.ReadAsync(_context, _businessId, new Dictionary<Guid, string> { [item.Id] = item.DefaultUnit }, today.AddDays(-730), today))[item.Id];
        Assert.Single(UsageData.Prepare(observations, today, DateTime.UtcNow).Series);
    }
    [RequiresDisposablePostgresFact]
    public async Task DuplicateImportedDailyTotalsAreRejectedByDatabase()
    {
        var item = await CreateItemAsync(current: 100); var batch = NewHistoricalBatch(); _context.AddRange(batch, HistoricalRow(batch, item)); await _context.SaveChangesAsync();
        _context.HistoricalUsageRows.Add(HistoricalRow(batch, item)); await Assert.ThrowsAsync<DbUpdateException>(() => _context.SaveChangesAsync()); _context.ChangeTracker.Clear();
        Assert.Single(await _context.HistoricalUsageRows.ToListAsync());
    }
    [RequiresDisposablePostgresFact]
    public async Task ImportedRowsCannotLinkAnotherBusinessItemEvenThroughDirectDatabaseWrite()
    {
        var item = await CreateItemAsync(current: 100); var batch = NewHistoricalBatch(); _context.Add(batch); await _context.SaveChangesAsync();
        var row = HistoricalRow(batch, item); row.BusinessId = Guid.NewGuid(); _context.Add(row);
        await Assert.ThrowsAsync<DbUpdateException>(() => _context.SaveChangesAsync()); _context.ChangeTracker.Clear(); Assert.Empty(await _context.HistoricalUsageRows.ToListAsync());
    }
    [RequiresDisposablePostgresFact]
    public async Task HistoricalBatchAndRowsRollbackTogether()
    {
        var item = await CreateItemAsync(current: 100);
        await using (var tx = await _context.Database.BeginTransactionAsync()) {
            var batch = NewHistoricalBatch(); _context.AddRange(batch, HistoricalRow(batch, item)); await _context.SaveChangesAsync(); await tx.RollbackAsync();
        }
        _context.ChangeTracker.Clear(); Assert.Empty(await _context.HistoricalUsageBatches.ToListAsync()); Assert.Empty(await _context.HistoricalUsageRows.ToListAsync());
        Assert.Equal(100, (await _context.CatalogItems.SingleAsync(x => x.Id == item.Id)).CurrentStock);
    }
    [RequiresDisposablePostgresFact]
    public async Task ImportedHistorySupportsForecastBusinessRulesAndMeasuredDegradationAlert()
    {
        var item = await CreateItemAsync(current: 100); var batch = NewHistoricalBatch(); batch.RowCount = 180;
        _context.Add(batch); _context.AddRange(Enumerable.Range(1, 180).Select(ago => HistoricalRow(batch, item, ago))); await _context.SaveChangesAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow); var now = DateTime.UtcNow;
        var observations = (await UsageObservationReader.ReadAsync(_context, _businessId, new Dictionary<Guid, string> { [item.Id] = item.DefaultUnit }, today.AddDays(-730), today))[item.Id];
        var artifact = ForecastModel.Train(_businessId, item.Id, item.DefaultUnit, UsageData.Prepare(observations, today, now), now);
        var root = Path.Combine(Path.GetTempPath(), "wa-phase4-monitor-" + Guid.NewGuid().ToString("N"));
        try {
            var store = new ArtifactStore(root); await store.SaveAsync(artifact); var service = new MlService(_context, _user, store, TimeProvider.System);
            var forecast = await service.AnalyzeAsync(item.Id, 7, default); Assert.Equal("ready", forecast.Status); Assert.Equal(0, forecast.Reorder!.Quantity);
            _context.MlPredictionLogs.AddRange(Enumerable.Range(0, 10).Select(i => new MlPredictionLog { BusinessId = _businessId, CatalogItemId = item.Id, UserId = _userId, ModelVersion = artifact.Version,
                InputVersion = artifact.DatasetVersion, StartDate = today.AddDays(-100 + i * 7), Horizon = 7, PredictedQuantity = i < 5 ? 70 : 140, DailyPredictionsJson = "[]", CreatedAt = now.AddDays(-100 + i * 7) }));
            await _context.SaveChangesAsync();
            var summary = Assert.Single(await service.MonitoringSummaryAsync(item.Id, default)); Assert.Equal(10, summary.CompletedForecasts); Assert.Equal(35, summary.Mae); Assert.True(summary.ReviewAlert);
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.MonitoringSummaryAsync(Guid.NewGuid(), default));
        } finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
