using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.ML;
using System.Text.Json;
using PurchaseAssistant.Application.DTOs;

namespace PurchaseAssistant.Infrastructure.Services;

public record HistoryPoint(DateOnly Date, [property: OperationalNumeric] double Quantity);
public record ForecastMetrics([property: OperationalNumeric] double Mae, [property: OperationalNumeric] double Rmse, [property: OperationalNumeric] double? Wape);
public record ForecastPoint(DateOnly Date, [property: OperationalNumeric] double Quantity, [property: OperationalNumeric] double Lower, [property: OperationalNumeric] double Upper);
public record ReorderAdvice([property: OperationalNumeric] double Quantity, DateOnly? ReorderDate, string RiskCategory, string Reason);
public record MovementAnomaly(Guid Id, DateTime Date, string Type, [property: OperationalNumeric] decimal Quantity, [property: OperationalNumeric] double Score, string Explanation);
public record MlAnalysis(Guid ItemId, string ItemName, string Unit, [property: OperationalNumeric] decimal CurrentStock, string Status, string Message,
    DateTime GeneratedAt, string? Model, string? ModelVersion, DateTime? TrainedAt, ForecastMetrics? Metrics,
    List<HistoryPoint> History, List<ForecastPoint> Forecast, ReorderAdvice? Reorder, List<MovementAnomaly> Anomalies);
public record PredictionOutcome(Guid Id, string ModelVersion, string InputVersion, DateTime CreatedAt, DateOnly StartDate, int Horizon,
    [property: OperationalNumeric] decimal PredictedQuantity, [property: OperationalNumeric] decimal? ActualQuantity, int ObservedDays);
public record MonitoringSummary(string ModelVersion, int Horizon, int CompletedForecasts,
    [property: OperationalNumeric] double Mae, [property: OperationalNumeric] double Rmse, [property: OperationalNumeric] double? Wape,
    [property: OperationalNumeric] double? Mape, [property: OperationalNumeric] double RecentMae, [property: OperationalNumeric] double? PreviousMae,
    bool ReviewAlert, string Message);

public class MlService(AppDbContext db, ICurrentUserService user, ArtifactStore store, TimeProvider clock)
{
    private Guid Business => user.BusinessId ?? throw new UnauthorizedAccessException();
    private void Check() { if (!user.HasPermission("stock.view") && user.Role is not ("Owner" or "SuperAdmin")) throw new UnauthorizedAccessException(); }
    public async Task<MlAnalysis> AnalyzeAsync(Guid itemId, int horizon, CancellationToken ct)
    {
        Check(); if (horizon is not (7 or 14 or 30)) throw new ArgumentException("Use a forecast horizon of 7, 14 or 30 days.");
        var now = clock.GetUtcNow().UtcDateTime; var today = DateOnly.FromDateTime(now);
        var item = await db.CatalogItems.AsNoTracking().SingleOrDefaultAsync(x => x.BusinessId == Business && x.Id == itemId && x.IsActive, ct) ?? throw new KeyNotFoundException("Item not found.");
        var from = today.AddDays(-730);
        var rows = (await UsageObservationReader.ReadAsync(db, Business, new Dictionary<Guid, string> { [itemId] = item.DefaultUnit }, from, today, ct))[itemId];
        var data = UsageData.Prepare(rows, today, now); var anomalies = await AnomaliesAsync(itemId, now, ct);
        var available = item.CurrentStock - item.ReservedStock;
        var history = data.Series.TakeLast(60).Select(x => new HistoryPoint(x.Date, x.Quantity)).ToList();
        MlAnalysis Empty(string status, string message) => new(item.Id, item.Name, item.DefaultUnit, available, status, message, now, null, null, null, null, history, [], null, anomalies);
        if (data.Series.Count < UsageData.MinimumDays) return Empty("insufficient_history", $"Insufficient historical data to generate a reliable forecast. {data.Series.Count} of 120 consecutive confirmed daily usage records are available through yesterday.");
        ModelArtifact? artifact;
        try { artifact = await store.LoadAsync(Business, item.Id, ct); }
        catch (Exception ex) when (ex is InvalidDataException or IOException or UnauthorizedAccessException) { return Empty("model_unavailable", "The model could not be loaded. Ask an administrator to validate or retrain it."); }
        if (artifact == null) return Empty("model_missing", "No trained model is available for this item. An administrator must run the offline training process.");
        if (!artifact.QualityAccepted) return Empty("quality_failed", "The trained model did not meet its baseline comparison. Forecasts are unavailable until retraining succeeds.");
        if (artifact.Unit != item.DefaultUnit || artifact.TrainingEnd > today.AddDays(-1) || artifact.TrainedAt > now
            || artifact.TrainingEnd < today.AddDays(-31)) return Empty("model_stale", "The model is stale or its unit has changed. Retraining is required.");
        var overlap = data.Series.Where(x => x.Date >= artifact.TrainingStart && x.Date <= artifact.TrainingEnd).ToList();
        if (UsageData.Fingerprint(overlap) != artifact.DatasetVersion) return Empty("history_changed", "Recorded training history has changed. Retraining is required.");
        List<DailyValue> predicted;
        try { predicted = ForecastModel.Predict(artifact.Model, data.Series, horizon); }
        catch (Exception ex) when (ex is InvalidDataException or ArgumentException) { return Empty("prediction_failed", "A reliable forecast could not be calculated. Retraining is required."); }
        var points = predicted.Select(x => new ForecastPoint(x.Date, Math.Round(x.Quantity, 4), Math.Round(Math.Max(0, x.Quantity - artifact.AbsoluteError90), 4), Math.Round(x.Quantity + artifact.AbsoluteError90, 4))).ToList();
        var sum = points.Sum(x => x.Quantity); var lower = points.Sum(x => x.Lower); var upper = points.Sum(x => x.Upper);
        var stock = (double)available; var buffer = (double)item.ReorderLevel;
        var risk = stock <= 0 ? "out_of_stock" : stock < lower ? "high" : stock < sum ? "elevated" : stock < upper ? "possible" : "low";
        double cumulative = 0; DateOnly? exhaustion = null;
        foreach (var p in points) { cumulative += p.Quantity; if (exhaustion == null && cumulative + buffer >= stock) exhaustion = p.Date; }
        var recommendation = new ReorderAdvice(Math.Round(Math.Max(0, sum + buffer - stock), 4), stock <= buffer ? today : exhaustion, risk,
            $"Covers {horizon} days of forecast consumption plus the configured reorder threshold ({buffer:0.####} {item.DefaultUnit}), less available stock. Supplier lead time is unknown; the date is the projected threshold crossing, not a guaranteed order deadline. Risk categories compare stock with forecast scenarios, not calibrated probabilities. Bands use held-out absolute error and are not guaranteed coverage intervals.");
        // One immutable snapshot per model/input/horizon/day; repeated reads do not flood history.
        if (!await db.MlPredictionLogs.AnyAsync(x => x.BusinessId == Business && x.CatalogItemId == item.Id && x.StartDate == today && x.Horizon == horizon && x.ModelVersion == artifact.Version && x.InputVersion == data.Version, ct)) {
            db.MlPredictionLogs.Add(new() { BusinessId = Business, CatalogItemId = item.Id, UserId = user.UserId!.Value, ModelVersion = artifact.Version,
                InputVersion = data.Version, StartDate = today, Horizon = horizon, PredictedQuantity = (decimal)sum, DailyPredictionsJson = JsonSerializer.Serialize(points), CreatedAt = now });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505", ConstraintName: "IX_MlPredictionLogs_UniqueForecast" }) {
                foreach (var entry in db.ChangeTracker.Entries<MlPredictionLog>().Where(x => x.State == EntityState.Added).ToList()) entry.State = EntityState.Detached;
            }
        }
        return new(item.Id, item.Name, item.DefaultUnit, available, "ready", "Forecasts support human review; they do not create purchases or change stock.", now,
            artifact.Model.Name, artifact.Version, artifact.TrainedAt, new(artifact.TestMetrics.Mae, artifact.TestMetrics.Rmse, artifact.TestMetrics.Wape), history, points, recommendation, anomalies);
    }
    public async Task<List<MovementAnomaly>> AnomaliesAsync(Guid item, DateTime now, CancellationToken ct)
    {
        var start = now.AddDays(-180);
        var movements = await db.StockMovements.AsNoTracking().Where(x => x.BusinessId == Business && x.CatalogItemId == item && x.CreatedAt >= start && x.CreatedAt <= now && x.QuantityDelta != 0)
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(2000).ToListAsync(ct);
        return AnalyzeMovementHistory(movements, now);
    }
    public static List<MovementAnomaly> AnalyzeMovementHistory(IReadOnlyList<StockMovement> movements, DateTime now)
    {
        var found = new List<MovementAnomaly>();
        foreach (var group in movements.Where(x => x.QuantityDelta != 0).GroupBy(x => (x.MovementType, Direction: Math.Sign(x.QuantityDelta)))) {
            var prior = new Queue<double>();
            // Equal-time rows cannot be each other's prior observations. Stable ID order preserves cutoff tie behavior.
            foreach (var instant in group.OrderBy(x => x.CreatedAt).ThenByDescending(x => x.Id).GroupBy(x => x.CreatedAt)) {
                if (prior.Count >= 20 && instant.Key >= now.AddDays(-30)) {
                    var values = prior.Order().ToArray(); var median = values[values.Length / 2];
                    var deviations = values.Select(x => Math.Abs(x - median)).Order().ToArray(); var mad = deviations[deviations.Length / 2];
                    foreach (var row in instant) {
                        var quantity = Math.Abs((double)row.QuantityDelta); var score = mad > 0 ? .67448975 * Math.Abs(quantity - median) / mad : 0;
                        if (score >= 3.5 || (mad == 0 && median > 0 && quantity > median * 3)) found.Add(new(row.Id, row.CreatedAt, row.MovementType, row.QuantityDelta, Math.Round(score, 2),
                            mad > 0 ? $"Quantity differs from the median of {values.Length} earlier movements of the same type and direction (robust z-score {score:0.00}). Review the source transaction; this is not evidence of fraud."
                                : "Quantity is more than three times the constant recent historical median. Review the source transaction; this is not evidence of fraud."));
                    }
                }
                foreach (var row in instant) { prior.Enqueue(Math.Abs((double)row.QuantityDelta)); if (prior.Count > 60) prior.Dequeue(); }
            }
        }
        return found.OrderByDescending(x => x.Date).ThenBy(x => x.Id).Take(50).ToList();
    }
    public async Task<List<PredictionOutcome>> MonitoringAsync(Guid itemId, CancellationToken ct)
    {
        Check(); if (!await db.CatalogItems.AnyAsync(x => x.Id == itemId && x.BusinessId == Business, ct)) throw new KeyNotFoundException();
        var now = clock.GetUtcNow().UtcDateTime; var today = DateOnly.FromDateTime(now); var cutoff = today.AddDays(-730);
        var logs = await db.MlPredictionLogs.AsNoTracking().Where(x => x.BusinessId == Business && x.CatalogItemId == itemId && x.StartDate >= cutoff).OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
        var earliest = logs.Count == 0 ? today : logs.Min(x => x.StartDate);
        var unit = await db.CatalogItems.Where(x => x.BusinessId == Business && x.Id == itemId).Select(x => x.DefaultUnit).SingleAsync(ct);
        var rows = (await UsageObservationReader.ReadAsync(db, Business, new Dictionary<Guid, string> { [itemId] = unit }, earliest, today, ct))[itemId];
        // Apply the same outcome validity rules used for training; never report partial or conflicting totals.
        var usage = rows.Where(x => x.Confirmed && x.Quantity is >= 0 and <= 1_000_000_000 && double.IsFinite(x.Quantity.Value) && x.RecordedAt != default && x.RecordedAt <= now && DateOnly.FromDateTime(x.RecordedAt) == x.Date)
            .GroupBy(x => x.Date).Where(g => g.Select(x => x.Quantity).Distinct().Count() == 1).Select(g => g.First()).ToList();
        return logs.Select(x => { var actual = usage.Where(y => y.Date >= x.StartDate && y.Date < x.StartDate.AddDays(x.Horizon) && y.Date < today).ToList();
            return new PredictionOutcome(x.Id, x.ModelVersion, x.InputVersion, x.CreatedAt, x.StartDate, x.Horizon, x.PredictedQuantity,
                actual.Select(y => y.Date).Distinct().Count() == x.Horizon ? (decimal?)actual.Sum(y => y.Quantity!.Value) : null, actual.Count); }).ToList();
    }
    public async Task<List<MonitoringSummary>> MonitoringSummaryAsync(Guid itemId, CancellationToken ct)
    {
        var outcomes = await MonitoringAsync(itemId, ct);
        return outcomes.Where(x => x.ActualQuantity != null).GroupBy(x => new { x.ModelVersion, x.Horizon }).Select(group => {
            var ordered = group.OrderByDescending(x => x.StartDate).ToList();
            var metrics = ForecastModel.Evaluate(ordered.Select(x => (double)x.ActualQuantity!.Value).ToArray(), ordered.Select(x => (double)x.PredictedQuantity).ToArray());
            var recent = ordered.Take(5).Average(x => (double)Math.Abs(x.PredictedQuantity - x.ActualQuantity!.Value));
            double? previous = ordered.Count >= 10 ? ordered.Skip(5).Take(5).Average(x => (double)Math.Abs(x.PredictedQuantity - x.ActualQuantity!.Value)) : null;
            var alert = previous != null && recent > previous * 1.5 + 1e-8;
            return new MonitoringSummary(group.Key.ModelVersion, group.Key.Horizon, ordered.Count, metrics.Mae, metrics.Rmse, metrics.Wape, metrics.Mape,
                recent, previous, alert, alert ? "Recent five completed forecast totals have over 50% greater MAE than the previous five. Review data and model; retraining is never automatic."
                : previous == null ? "Ten complete forecasts of the same model and horizon are needed for a degradation comparison." : "No degradation threshold crossed. Overlapping horizons are correlated; this alert is a review rule, not a statistical confidence test.");
        }).ToList();
    }
}
