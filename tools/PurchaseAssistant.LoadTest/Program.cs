using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

// Called ONLY by the disposable PostgreSQL rehearsal. Credentials stay in inherited environment, never arguments/output.
if (args.Length != 2 || args[0] != "--nonproduction") return 2;
var uri = new Uri(Environment.GetEnvironmentVariable("WA_LOAD_URL") ?? "");
if (uri.Scheme != "http" || uri.Host != "127.0.0.1" || !((Environment.GetEnvironmentVariable("WA_LOAD_DATABASE") ?? "").StartsWith("wa_test_restore_", StringComparison.Ordinal))) return 2;
var items = (Environment.GetEnvironmentVariable("WA_LOAD_ITEMS") ?? "").Split(',');
if (items.Length != 4 || items.Any(x => !Guid.TryParse(x, out _))) return 2;
var token = Environment.GetEnvironmentVariable("WA_LOAD_TOKEN") ?? throw new InvalidOperationException();
var samples = new ConcurrentBag<Sample>(); var watch = Stopwatch.StartNew();
using var server = Process.GetProcessById(int.Parse(Environment.GetEnvironmentVariable("WA_LOAD_PID")!));
var cpuBefore = server.TotalProcessorTime; long peakMemory = 0; double peakCoreCpu = 0;
using var stop = new CancellationTokenSource();
var monitor = Task.Run(async () => {
    var priorCpu = server.TotalProcessorTime; var priorTime = watch.Elapsed.TotalSeconds;
    while (!stop.IsCancellationRequested) {
        server.Refresh(); peakMemory = Math.Max(peakMemory, server.WorkingSet64);
        var currentCpu = server.TotalProcessorTime; var currentTime = watch.Elapsed.TotalSeconds;
        if (currentTime > priorTime) peakCoreCpu = Math.Max(peakCoreCpu, (currentCpu - priorCpu).TotalSeconds / (currentTime - priorTime) * 100);
        priorCpu = currentCpu; priorTime = currentTime;
        try { await Task.Delay(100, stop.Token); } catch (OperationCanceledException) { break; }
    }
});
async Task<JsonElement?> Request(HttpClient client, string operation, HttpMethod method, string path, object? body = null, bool ai = false)
{
    var timer = Stopwatch.StartNew(); var status = 0; var expected = false; var throttled = false;
    try {
        using var message = new HttpRequestMessage(method, path);
        if (body != null) message.Content = JsonContent.Create(body);
        using var response = await client.SendAsync(message); status = (int)response.StatusCode;
        throttled = status == 429 && ai;
        expected = response.IsSuccessStatusCode || throttled;
        var content = await response.Content.ReadAsStringAsync();
        if (content.Length > 2_000_000) { expected = false; return null; }
        if (throttled || content.Length == 0) return null;
        var json = JsonDocument.Parse(content).RootElement.Clone();
        if (ai) expected = status == 200 && json.TryGetProperty("status", out var state) && state.GetString() == "Error";
        return expected ? json : null;
    } catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { expected = false; return null; }
    finally { samples.Add(new(operation, status, timer.Elapsed.TotalMilliseconds, !expected, throttled)); }
}
try {
    await Task.WhenAll(Enumerable.Range(0, 4).Select(async worker => {
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { BaseAddress = uri, Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        for (var cycle = 0; cycle < 6; cycle++) {
            await Request(client, "login", HttpMethod.Post, "/api/v1/auth/login", new { email = Environment.GetEnvironmentVariable("WA_LOAD_EMAIL"), password = Environment.GetEnvironmentVariable("WA_LOAD_PASSWORD") });
            await Request(client, "dashboard", HttpMethod.Get, "/api/v1/dashboard");
            await Request(client, "product-search", HttpMethod.Get, "/api/v1/catalog/items?page=1&pageSize=50&search=Load");
            await Request(client, "stock-list", HttpMethod.Get, "/api/v1/stock?page=1&pageSize=50");
            var stock = await Request(client, "stock-read", HttpMethod.Get, "/api/v1/stock/" + items[worker]);
            if (stock != null) await Request(client, "stock-update", HttpMethod.Post, "/api/v1/stock/" + items[worker] + "/adjust", new { quantityDelta = 1, reason = "Synthetic isolated load rehearsal", expectedVersion = stock.Value.GetProperty("rowVersion").GetString() });
            var purchase = new JsonObject { ["supplierId"] = Environment.GetEnvironmentVariable("WA_LOAD_SUPPLIER"), ["orderNumber"] = "LOAD-" + Guid.NewGuid().ToString("N"), ["notes"] = "Synthetic isolated load rehearsal",
                ["items"] = new JsonArray(new JsonObject { ["catalogItemId"] = items[worker], ["unit"] = "PCS", ["orderedQuantity"] = 1, ["unitPrice"] = 1, ["discountPercent"] = 0, ["taxPercent"] = 0 }) };
            var preview = await Request(client, "purchase-preview", HttpMethod.Post, "/api/v1/purchases/preview", purchase);
            if (preview != null) { purchase["previewToken"] = preview.Value.GetProperty("previewToken").GetString(); await Request(client, "purchase-create", HttpMethod.Post, "/api/v1/purchases", purchase); }
            await Request(client, "reports", HttpMethod.Get, "/api/v1/reports/purchases-summary");
            await Request(client, "ml-inference", HttpMethod.Get, "/api/v1/ml/items/" + Environment.GetEnvironmentVariable("WA_LOAD_ML_ITEM") + "?horizon=14");
            await Request(client, "ai-unconfigured", HttpMethod.Post, "/api/v1/ai/purchase-intent/parse", new { prompt = "Buy 2 PCS of Load item" }, true);
        }
    }));
} finally { stop.Cancel(); await monitor; watch.Stop(); }
server.Refresh();
double Percentile(IEnumerable<double> values, double p) { var sorted = values.Order().ToArray(); return sorted[(int)Math.Ceiling(sorted.Length * p) - 1]; }
var report = new { NonproductionSynthetic = true, Concurrency = 4, CyclesPerWorker = 6, Requests = samples.Count, DurationSeconds = watch.Elapsed.TotalSeconds,
    ThroughputPerSecond = samples.Count / watch.Elapsed.TotalSeconds, UnexpectedErrors = samples.Count(x => x.UnexpectedError), ExpectedAiRateLimits = samples.Count(x => x.ExpectedThrottle),
    MedianMs = Percentile(samples.Select(x => x.Milliseconds), .5), P95Ms = Percentile(samples.Select(x => x.Milliseconds), .95), P99Ms = Percentile(samples.Select(x => x.Milliseconds), .99),
    ServerCpuSeconds = (server.TotalProcessorTime - cpuBefore).TotalSeconds, AverageCpuCorePercent = (server.TotalProcessorTime - cpuBefore).TotalSeconds / watch.Elapsed.TotalSeconds * 100,
    PeakSampledCpuCorePercent = peakCoreCpu, LogicalProcessors = Environment.ProcessorCount, PeakWorkingSetBytes = peakMemory,
    Operations = samples.GroupBy(x => x.Operation).Select(g => new { Operation = g.Key, Requests = g.Count(), MedianMs = Percentile(g.Select(x => x.Milliseconds), .5), P95Ms = Percentile(g.Select(x => x.Milliseconds), .95),
        UnexpectedErrors = g.Count(x => x.UnexpectedError), StatusCounts = g.GroupBy(x => x.Status).ToDictionary(x => x.Key, x => x.Count()) }),
    Limits = "Local synthetic fixture with four concurrent authenticated clients; not a production SLA or multi-instance test. AI verifies explicit unavailable and throttling behavior, not live provider speed. CPU percentages use one core = 100%; sampled peaks are not whole-machine utilization." };
await using var file = new FileStream(args[1], FileMode.CreateNew); await JsonSerializer.SerializeAsync(file, report, new JsonSerializerOptions { WriteIndented = true });
Console.WriteLine($"Controlled nonproduction load: {samples.Count} requests, {report.UnexpectedErrors} unexpected errors, {report.ExpectedAiRateLimits} expected AI throttles. Report saved.");
return report.UnexpectedErrors == 0 ? 0 : 1;

record Sample(string Operation, int Status, double Milliseconds, bool UnexpectedError, bool ExpectedThrottle);
