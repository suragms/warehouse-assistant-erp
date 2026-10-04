using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using PurchaseAssistant.ML;
using System.Text.Json;
using System.Security.Cryptography;

// Offline operator tool. Connection strings are accepted only through environment/local secrets, never arguments or logs.
if (args.Length == 0 || args[0] is not ("inspect" or "extract" or "train" or "compare" or "promote" or "rollback")) {
    Console.Error.WriteLine("Use inspect, extract <business-id> <new-dataset.json>, train <dataset.json> <new-candidate-directory>, compare/promote <candidate-directory> <serving-directory> <business-id> <item-id> <expected-current-version> [--approved-real-data], or rollback <serving-directory> <business-id> <item-id> <expected-current-version> <backup-file>."); return 2;
}
try {
    var command = args[0];
    if (command is "compare" or "promote") {
        if (args.Length < 6 || !Guid.TryParse(args[3], out var businessId) || !Guid.TryParse(args[4], out var itemId)) throw new ArgumentException();
        var candidate = await new ArtifactStore(args[1]).LoadAsync(businessId, itemId) ?? throw new InvalidDataException();
        var serving = new ArtifactStore(args[2]); var current = await serving.LoadAsync(businessId, itemId);
        if ((current?.Version ?? "none") != args[5]) throw new InvalidOperationException();
        var decision = command == "compare" ? ModelPromotion.Evaluate(candidate, current)
            : args.Contains("--approved-real-data") ? await serving.PromoteAsync(candidate, args[5]) : throw new ArgumentException("Approve real-data provenance before promotion.");
        Console.WriteLine(JsonSerializer.Serialize(new { command, candidate.Version, candidate.CodeVersion, decision })); return decision.Allowed ? 0 : 3;
    }
    if (command == "rollback") {
        if (args.Length != 6 || !Guid.TryParse(args[2], out var businessId) || !Guid.TryParse(args[3], out var itemId)) throw new ArgumentException();
        await new ArtifactStore(args[1]).RollbackAsync(businessId, itemId, args[4], args[5]); Console.WriteLine("Validated retained artifact restored atomically. Serving freshness checks still apply."); return 0;
    }
    if (command == "train") {
        if (args.Length != 3 || new FileInfo(args[1]).Length > 100_000_000) throw new ArgumentException("Invalid training input.");
        var dataset = JsonSerializer.Deserialize<TrainingDataset>(await File.ReadAllTextAsync(args[1])) ?? throw new InvalidDataException();
        if (dataset.BusinessId == Guid.Empty || dataset.ExtractedAt == default || dataset.ExtractedAt > DateTime.UtcNow || dataset.Items == null || dataset.Items.Count > 10000
            || dataset.Items.Any(x => x == null || x.ItemId == Guid.Empty || string.IsNullOrWhiteSpace(x.Unit) || x.Unit.Length > 20 || x.Observations == null || x.Observations.Count > 1500 || x.Observations.Any(r => r == null))
            || dataset.Items.Select(x => x.ItemId).Distinct().Count() != dataset.Items.Count) throw new InvalidDataException();
        if (Directory.Exists(args[2])) throw new ArgumentException("Choose a new candidate directory; training never replaces installed models.");
        var store = new ArtifactStore(args[2]); var trained = 0; var unavailable = 0; var evaluations = new List<(ModelArtifact Artifact, double Volume, double ZeroFraction)>();
        var codeVersion = "ml-binary-sha256:" + Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(typeof(ForecastModel).Assembly.Location))).ToLowerInvariant();
        foreach (var item in dataset.Items) {
            var prepared = UsageData.Prepare(item.Observations, DateOnly.FromDateTime(dataset.ExtractedAt), dataset.ExtractedAt);
            if (prepared.Series.Count < UsageData.MinimumDays) { unavailable++; continue; }
            var artifact = ForecastModel.Train(dataset.BusinessId, item.ItemId, item.Unit, prepared, DateTime.UtcNow) with { CodeVersion = codeVersion };
            var fitting = prepared.Series.Where(x => x.Date < artifact.ValidationStart).ToList();
            evaluations.Add((artifact, fitting.Average(x => x.Quantity), (double)fitting.Count(x => x.Quantity == 0) / fitting.Count));
            await store.SaveAsync(artifact); trained++;
            Console.WriteLine(JsonSerializer.Serialize(new { item.ItemId, artifact.Model.Name, artifact.Version, artifact.ValidationMetrics, artifact.TestMetrics, artifact.BaselineTestMetrics, artifact.QualityAccepted, artifact.TrainingStart, artifact.TrainingEnd }));
        }
        if (trained > 0) {
            var medians = evaluations.GroupBy(x => x.Artifact.Unit).ToDictionary(g => g.Key, g => g.Select(x => x.Volume).Order().ElementAt(g.Count() / 2));
            var cohorts = evaluations.GroupBy(x => new { x.Artifact.Unit, Cohort = x.ZeroFraction >= .3 ? "intermittent" : x.Volume >= medians[x.Artifact.Unit] ? "high-volume" : "low-volume" })
                .Select(g => new { g.Key.Unit, g.Key.Cohort, Items = g.Count(), MeanItemMae = g.Average(x => x.Artifact.TestMetrics.Mae),
                    MeanItemRmse = g.Average(x => x.Artifact.TestMetrics.Rmse), MeanDefinedItemWape = g.Where(x => x.Artifact.TestMetrics.Wape != null).Select(x => x.Artifact.TestMetrics.Wape).DefaultIfEmpty().Average(),
                    MeanDefinedItemMape = g.Where(x => x.Artifact.TestMetrics.Mape != null).Select(x => x.Artifact.TestMetrics.Mape).DefaultIfEmpty().Average(), BaselineMeanItemMae = g.Average(x => x.Artifact.BaselineTestMetrics.Mae) });
            await using var report = new FileStream(Path.Combine(args[2], "evaluation-report.json"), FileMode.CreateNew);
            await JsonSerializer.SerializeAsync(report, new { dataset.BusinessId, WarehouseId = dataset.BusinessId, dataset.ExtractedAt, codeVersion, trained, unavailable,
                Overall = new { Items = trained, MeanDefinedItemWape = evaluations.Where(x => x.Artifact.TestMetrics.Wape != null).Select(x => x.Artifact.TestMetrics.Wape).DefaultIfEmpty().Average() },
                Cohorts = cohorts, Items = evaluations.Select(x => new { x.Artifact.ItemId, x.Artifact.Unit, DatasetSize = x.Artifact.TrainingHistory.Count, x.Artifact.DatasetVersion, x.Artifact.Version, x.Artifact.Model.Name,
                    x.Artifact.ValidationStart, x.Artifact.ValidationEnd, x.Artifact.TestStart, x.Artifact.TestEnd, x.Artifact.ValidationMetrics, x.Artifact.TestMetrics, x.Artifact.BaselineTestMetrics, x.Artifact.QualityAccepted }),
                Limitations = "Thirty-day recursive windows; cohorts are determined from pre-validation history within each unit. Macro item metrics are not pooled accuracy. Current model comparison requires compare with untouched dates. Provenance must be approved separately; synthetic input does not establish business accuracy." });
        }
        Console.WriteLine(JsonSerializer.Serialize(new { trained, insufficientHistory = unavailable })); return trained > 0 ? 0 : 3;
    }
    var connection = Environment.GetEnvironmentVariable("ML_DATABASE");
    if (string.IsNullOrWhiteSpace(connection) && args.Contains("--development-secrets")) {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "UserSecrets", "PurchaseAssistant.WarehousePurchaseAssistant", "secrets.json");
        using var secrets = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        connection = secrets.RootElement.TryGetProperty("ConnectionStrings:DefaultConnection", out var value) ? value.GetString() : null;
    }
    if (string.IsNullOrWhiteSpace(connection)) throw new ArgumentException("Configure ML_DATABASE or explicitly select local development secrets.");
    var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options;
    if (command == "inspect") {
        await using var db = new AppDbContext(options);
        // Metadata only. Does not read keys, personal records, stock values or purchase prices.
        Console.WriteLine(JsonSerializer.Serialize(new {
            businesses = await db.Businesses.CountAsync(), items = await db.CatalogItems.IgnoreQueryFilters().CountAsync(),
            usageRows = await db.DailyUsageLogs.IgnoreQueryFilters().CountAsync(),
            usageDates = await db.DailyUsageLogs.IgnoreQueryFilters().Select(x => x.Date).Distinct().CountAsync(),
            movements = await db.StockMovements.IgnoreQueryFilters().CountAsync(), purchases = await db.Purchases.IgnoreQueryFilters().CountAsync()
        })); return 0;
    }
    if (args.Length < 3 || !Guid.TryParse(args[1], out var business) || business == Guid.Empty) throw new ArgumentException("A business ID and output path are required.");
    await using var scoped = new AppDbContext(options, new Tenant(business));
    var now = DateTime.UtcNow; var from = DateOnly.FromDateTime(now).AddDays(-730);
    var catalog = await scoped.CatalogItems.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Id).Take(10001).Select(x => new { x.Id, x.DefaultUnit }).ToListAsync();
    if (catalog.Count > 10000) throw new InvalidOperationException("Use a partitioned extraction for more than 10000 active items.");
    var output = new List<TrainingItem>();
    var all = await UsageObservationReader.ReadAsync(scoped, business, catalog.ToDictionary(x => x.Id, x => x.DefaultUnit), from, DateOnly.FromDateTime(now));
    foreach (var item in catalog) output.Add(new(item.Id, item.DefaultUnit, all[item.Id]));
    // Explicit output, no overwrite of a preexisting extraction.
    await using var file = new FileStream(Path.GetFullPath(args[2]), FileMode.CreateNew, FileAccess.Write, FileShare.None);
    await JsonSerializer.SerializeAsync(file, new TrainingDataset(business, now, output));
    Console.WriteLine(JsonSerializer.Serialize(new { items = output.Count, observations = output.Sum(x => x.Observations.Count) })); return 0;
} catch (Exception ex) when (ex is ArgumentException or IOException or InvalidOperationException or JsonException or Npgsql.NpgsqlException) {
    Console.Error.WriteLine("ML operation failed. Check input, database schema/access and storage configuration. No connection or record details are logged."); return 1;
}

record TrainingDataset(Guid BusinessId, DateTime ExtractedAt, List<TrainingItem> Items);
record TrainingItem(Guid ItemId, string Unit, List<UsageObservation> Observations);
sealed class Tenant(Guid business) : ITenantProvider { public Guid GetBusinessId() => business; }
