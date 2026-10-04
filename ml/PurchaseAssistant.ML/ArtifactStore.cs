using System.Security.Cryptography;
using System.Text.Json;

namespace PurchaseAssistant.ML;

public class ArtifactStore(string? directory)
{
    public bool Configured => !string.IsNullOrWhiteSpace(directory);
    private string PathFor(Guid business, Guid item) => Path.Combine(Path.GetFullPath(directory ?? throw new InvalidOperationException("Model storage is not configured.")), business.ToString("N"), item.ToString("N") + ".json");
    private record Envelope(string Sha256, string Payload);
    public async Task SaveAsync(ModelArtifact artifact, CancellationToken ct = default)
    {
        Validate(artifact, artifact.BusinessId, artifact.ItemId);
        var path = PathFor(artifact.BusinessId, artifact.ItemId); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var payload = JsonSerializer.Serialize(artifact); var envelope = JsonSerializer.Serialize(new Envelope(Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(payload))), payload));
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        // Training writes candidates only. Promotion owns replacement and a retained rollback copy.
        try { await File.WriteAllTextAsync(temp, envelope, ct); File.Move(temp, path, false); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public async Task<PromotionDecision> PromoteAsync(ModelArtifact candidate, string expectedVersion, CancellationToken ct = default)
    {
        Validate(candidate, candidate.BusinessId, candidate.ItemId);
        var path = PathFor(candidate.BusinessId, candidate.ItemId); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        // One operator mutation at a time; lock is released even when evaluation or IO fails.
        await using var gate = new FileStream(path + ".promotion.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var current = await LoadAsync(candidate.BusinessId, candidate.ItemId, ct);
        if ((current?.Version ?? "none") != expectedVersion) throw new InvalidOperationException("Current version changed; review promotion again.");
        var decision = ModelPromotion.Evaluate(candidate, current);
        if (!decision.Allowed) return decision;
        var staged = Path.Combine(Path.GetDirectoryName(path)!, "candidate-" + Guid.NewGuid().ToString("N"));
        try {
            var stagingStore = new ArtifactStore(staged); await stagingStore.SaveAsync(candidate, ct);
            var prepared = stagingStore.PathFor(candidate.BusinessId, candidate.ItemId);
            // Durable authorization precedes replacement. Installed version is the source of truth after an interrupted operator process.
            var receipt = path + ".promotion-" + Guid.NewGuid().ToString("N") + ".json";
            await File.WriteAllTextAsync(receipt, JsonSerializer.Serialize(new { AuthorizedAt = DateTime.UtcNow, candidate.BusinessId, candidate.ItemId, candidate.Version,
                candidate.DatasetVersion, candidate.FeatureVersion, candidate.CodeVersion, candidate.TrainedAt, candidate.ValidationStart, candidate.ValidationEnd,
                candidate.TestStart, candidate.TestEnd, candidate.ValidationMetrics, candidate.TestMetrics, candidate.BaselineTestMetrics, Decision = decision }), ct);
            if (current != null) {
                var archive = path + ".rollback-" + Guid.NewGuid().ToString("N") + ".json";
                File.Replace(prepared, path, archive);
            } else File.Move(prepared, path, false);
        } finally {
            // Directory is generated internally under the configured store, never supplied by an HTTP caller.
            if (Directory.Exists(staged)) Directory.Delete(staged, true);
        }
        return decision;
    }
    public async Task RollbackAsync(Guid business, Guid item, string expectedVersion, string backupFile, CancellationToken ct = default)
    {
        var path = PathFor(business, item); var backup = Path.GetFullPath(backupFile);
        if (Path.GetDirectoryName(backup) != Path.GetDirectoryName(path) || !Path.GetFileName(backup).StartsWith(Path.GetFileName(path) + ".rollback-", StringComparison.Ordinal))
            throw new ArgumentException("Select a retained rollback file for this item in the same private directory.");
        await using var gate = new FileStream(path + ".promotion.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var current = await LoadAsync(business, item, ct);
        if (current?.Version != expectedVersion) throw new InvalidOperationException("Current version changed; review rollback again.");
        var temp = path + ".restore-" + Guid.NewGuid().ToString("N");
        try {
            if (new FileInfo(backup).Length > 1_000_000) throw new InvalidDataException();
            File.Copy(backup, temp, false);
            // Validate the copied envelope using the same size, checksum and scope checks as serving.
            var envelope = JsonSerializer.Deserialize<Envelope>(await File.ReadAllTextAsync(temp, ct)) ?? throw new InvalidDataException();
            if (new FileInfo(temp).Length > 1_000_000 || envelope.Payload == null || Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(envelope.Payload))) != envelope.Sha256) throw new InvalidDataException();
            var restored = JsonSerializer.Deserialize<ModelArtifact>(envelope.Payload) ?? throw new InvalidDataException();
            Validate(restored, business, item);
            await File.WriteAllTextAsync(path + ".rollback-authorization-" + Guid.NewGuid().ToString("N") + ".json",
                JsonSerializer.Serialize(new { AuthorizedAt = DateTime.UtcNow, BusinessId = business, ItemId = item, PreviousVersion = current.Version, RestoredVersion = restored.Version }), ct);
            File.Replace(temp, path, path + ".rollback-" + Guid.NewGuid().ToString("N") + ".json");
        } finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public async Task<ModelArtifact?> LoadAsync(Guid business, Guid item, CancellationToken ct = default)
    {
        if (!Configured) return null;
        var path = PathFor(business, item); if (!File.Exists(path)) return null;
        if (new FileInfo(path).Length > 1_000_000) throw new InvalidDataException("Invalid model artifact.");
        try {
            var envelope = JsonSerializer.Deserialize<Envelope>(await File.ReadAllTextAsync(path, ct)) ?? throw new InvalidDataException();
            if (envelope.Payload == null || Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(envelope.Payload))) != envelope.Sha256) throw new InvalidDataException();
            var model = JsonSerializer.Deserialize<ModelArtifact>(envelope.Payload) ?? throw new InvalidDataException();
            Validate(model, business, item); return model;
        } catch (Exception ex) when (ex is JsonException or NullReferenceException or ArgumentException) { throw new InvalidDataException("Invalid model artifact."); }
    }
    public static void Validate(ModelArtifact a, Guid business, Guid item)
    {
        if (business == Guid.Empty || item == Guid.Empty || a.Model == null || a.TrainingHistory == null || a.TrainingHistory.Count < 120
            || a.ValidationMetrics == null || a.TestMetrics == null || a.BaselineTestMetrics == null || string.IsNullOrWhiteSpace(a.Unit) || a.Unit.Length > 20)
            throw new InvalidDataException("Invalid model metadata.");
        static bool MetricsValid(ErrorMetrics m) => m != null && m.Count == 30 && m.NonZeroCount is >= 0 and <= 30
            && double.IsFinite(m.Mae) && m.Mae >= 0 && double.IsFinite(m.Rmse) && m.Rmse >= 0
            && (m.Wape == null || (double.IsFinite(m.Wape.Value) && m.Wape >= 0)) && (m.Mape == null || (double.IsFinite(m.Mape.Value) && m.Mape >= 0))
            && (m.RSquared == null || (double.IsFinite(m.RSquared.Value) && m.RSquared <= 1));
        if (a.Version != a.DatasetVersion + "-" + a.FeatureVersion + "-" + a.Model.Name || a.TrainedAt == default
            || DateOnly.FromDateTime(a.TrainedAt) <= a.TrainingEnd || a.ValidationStart != a.TrainingHistory[^60].Date
            || a.ValidationEnd != a.TrainingHistory[^31].Date || a.TestStart != a.TrainingHistory[^30].Date || a.TestEnd != a.TrainingEnd
            || !MetricsValid(a.TestMetrics) || !MetricsValid(a.BaselineTestMetrics) || a.ValidationMetrics.Count != 3
            || ForecastModel.Candidates.Any(x => !a.ValidationMetrics.TryGetValue(x, out var m) || !MetricsValid(m))
            || a.QualityAccepted != (a.TestMetrics.Mae <= a.BaselineTestMetrics.Mae * 1.1 + 1e-8)) throw new InvalidDataException("Invalid model evaluation metadata.");
        if (a.SchemaVersion != 1 || a.BusinessId != business || a.ItemId != item || a.FeatureVersion != UsageData.FeatureVersion
            || !ForecastModel.Candidates.Contains(a.Model.Name) || a.TrainingHistory.Count is < 120 or > 730
            || a.DatasetVersion != UsageData.Fingerprint(a.TrainingHistory) || !double.IsFinite(a.AbsoluteError90) || a.AbsoluteError90 < 0
            || a.TrainingStart != a.TrainingHistory[0].Date || a.TrainingEnd != a.TrainingHistory[^1].Date
            || a.TrainingHistory.Any(x => !double.IsFinite(x.Quantity) || x.Quantity is < 0 or > 1_000_000_000)
            || a.TrainingHistory.Zip(a.TrainingHistory.Skip(1)).Any(x => x.Second.Date != x.First.Date.AddDays(1))) throw new InvalidDataException("Invalid model artifact.");
        if (a.Model.Name == "ridge" && (a.Model.Coefficients.Length != 8 || a.Model.Means.Length != 7 || a.Model.Scales.Length != 7
            || a.Model.Coefficients.Concat(a.Model.Means).Concat(a.Model.Scales).Any(x => !double.IsFinite(x)) || a.Model.Scales.Any(x => x <= 0))) throw new InvalidDataException("Invalid model coefficients.");
    }
}
