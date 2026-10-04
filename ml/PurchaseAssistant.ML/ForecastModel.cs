namespace PurchaseAssistant.ML;

public record ErrorMetrics(double Mae, double Rmse, double? Wape, double? Mape, double? RSquared, int Count, int NonZeroCount);
public record FittedModel(string Name, double[] Coefficients, double[] Means, double[] Scales);
public record ModelArtifact(
    int SchemaVersion, Guid BusinessId, Guid ItemId, string Unit, string Version, string DatasetVersion, string FeatureVersion,
    DateTime TrainedAt, DateOnly TrainingStart, DateOnly TrainingEnd, DateOnly ValidationStart, DateOnly ValidationEnd,
    DateOnly TestStart, DateOnly TestEnd, string FrameworkVersion, FittedModel Model,
    Dictionary<string, ErrorMetrics> ValidationMetrics, ErrorMetrics TestMetrics, ErrorMetrics BaselineTestMetrics,
    double AbsoluteError90, List<DailyValue> TrainingHistory, bool QualityAccepted, string CodeVersion = "legacy-unrecorded");

public static class ForecastModel
{
    public static readonly string[] Candidates = ["mean7", "seasonal7", "ridge"];
    public static double[] Features(IReadOnlyList<double> history, DateOnly date)
    {
        if (history.Count < 28) throw new ArgumentException("At least 28 prior observations are required.");
        return [history[^1], history[^7], history[^14], history.TakeLast(7).Average(), history.TakeLast(28).Average(),
            Math.Sin(2 * Math.PI * (int)date.DayOfWeek / 7), Math.Cos(2 * Math.PI * (int)date.DayOfWeek / 7)];
    }
    public static FittedModel Fit(string name, IReadOnlyList<DailyValue> data)
    {
        if (!Candidates.Contains(name) || data.Count < 56) throw new ArgumentException("Invalid model or insufficient training data.");
        if (name != "ridge") return new(name, [], [], []);
        var values = data.Select(x => x.Quantity).ToArray();
        var x = Enumerable.Range(28, data.Count - 28).Select(i => Features(values.Take(i).ToArray(), data[i].Date)).ToArray();
        var means = Enumerable.Range(0, 7).Select(j => x.Average(row => row[j])).ToArray();
        var scales = Enumerable.Range(0, 7).Select(j => Math.Max(1e-8, Math.Sqrt(x.Average(row => Math.Pow(row[j] - means[j], 2))))).ToArray();
        var matrix = new double[8, 8]; var rhs = new double[8];
        for (var i = 0; i < x.Length; i++)
        {
            var row = new[] { 1d }.Concat(x[i].Select((v, j) => (v - means[j]) / scales[j])).ToArray();
            for (var a = 0; a < 8; a++) { rhs[a] += row[a] * values[i + 28]; for (var b = 0; b < 8; b++) matrix[a, b] += row[a] * row[b]; }
        }
        // L2 penalty 1, unpenalized intercept; deterministic positive-definite normal equations.
        for (var j = 1; j < 8; j++) matrix[j, j] += 1;
        for (var j = 0; j < 8; j++)
        {
            var pivot = matrix[j, j];
            if (!double.IsFinite(pivot) || Math.Abs(pivot) < 1e-12) throw new InvalidOperationException("Model fit is numerically unstable.");
            for (var k = j; k < 8; k++) matrix[j, k] /= pivot;
            rhs[j] /= pivot;
            for (var i = 0; i < 8; i++) if (i != j) { var factor = matrix[i, j]; for (var k = j; k < 8; k++) matrix[i, k] -= factor * matrix[j, k]; rhs[i] -= factor * rhs[j]; }
        }
        return new(name, rhs, means, scales);
    }
    public static List<DailyValue> Predict(FittedModel model, IReadOnlyList<DailyValue> history, int horizon)
    {
        if (horizon is < 1 or > 30 || history.Count < 28) throw new ArgumentException("Invalid horizon or history.");
        var quantities = history.Select(x => x.Quantity).ToList(); var output = new List<DailyValue>();
        for (var i = 1; i <= horizon; i++)
        {
            var date = history[^1].Date.AddDays(i);
            var value = model.Name switch {
                "mean7" => quantities.TakeLast(7).Average(), "seasonal7" => quantities[^7],
                "ridge" => model.Coefficients[0] + Features(quantities, date).Select((v, j) => model.Coefficients[j + 1] * (v - model.Means[j]) / model.Scales[j]).Sum(),
                _ => throw new InvalidDataException("Unsupported model.") };
            if (!double.IsFinite(value) || value > 1_000_000_000) throw new InvalidDataException("Prediction is outside supported quantities.");
            value = Math.Max(0, value); quantities.Add(value); output.Add(new(date, value));
        }
        return output;
    }
    public static ErrorMetrics Evaluate(IReadOnlyList<double> actual, IReadOnlyList<double> predicted)
    {
        if (actual.Count == 0 || actual.Count != predicted.Count) throw new ArgumentException("Evaluation requires aligned observations.");
        var errors = actual.Select((x, i) => x - predicted[i]).ToArray(); var abs = errors.Sum(Math.Abs); var squared = errors.Sum(x => x * x);
        var nonzero = actual.Select((x, i) => (x, i)).Where(x => x.x != 0).ToArray(); var variance = actual.Sum(x => Math.Pow(x - actual.Average(), 2));
        return new(abs / actual.Count, Math.Sqrt(squared / actual.Count), actual.Sum() == 0 ? null : abs / actual.Sum(),
            nonzero.Length == 0 ? null : nonzero.Average(x => Math.Abs(errors[x.i] / x.x)), variance < 1e-12 ? null : 1 - squared / variance, actual.Count, nonzero.Length);
    }
    public static ModelArtifact Train(Guid business, Guid item, string unit, PreparedData prepared, DateTime trainedAt)
    {
        var data = prepared.Series;
        if (business == Guid.Empty || item == Guid.Empty || string.IsNullOrWhiteSpace(unit) || data.Count < UsageData.MinimumDays) throw new ArgumentException("Insufficient historical data: 120 confirmed consecutive completed days are required.");
        var tuningStart = data.Count - 60; var testStart = data.Count - 30;
        var train = data.Take(tuningStart).ToList(); var validation = data.Skip(tuningStart).Take(30).Select(x => x.Quantity).ToArray();
        var scores = Candidates.ToDictionary(name => name, name => Evaluate(validation, Predict(Fit(name, train), train, 30).Select(x => x.Quantity).ToArray()));
        var baseline = scores["mean7"].Mae <= scores["seasonal7"].Mae ? "mean7" : "seasonal7";
        var selected = scores["ridge"].Mae < scores[baseline].Mae * .99 ? "ridge" : baseline;
        var pretest = data.Take(testStart).ToList(); var actual = data.Skip(testStart).Select(x => x.Quantity).ToArray();
        var predicted = Predict(Fit(selected, pretest), pretest, 30).Select(x => x.Quantity).ToArray();
        var testScore = Evaluate(actual, predicted); var baselineScore = Evaluate(actual, Predict(Fit(baseline, pretest), pretest, 30).Select(x => x.Quantity).ToArray());
        var error90 = actual.Select((x, i) => Math.Abs(x - predicted[i])).Order().ElementAt(26);
        var version = UsageData.Fingerprint(data) + "-" + UsageData.FeatureVersion + "-" + selected;
        return new(1, business, item, unit, version, prepared.Version, UsageData.FeatureVersion, trainedAt,
            data[0].Date, data[^1].Date, data[tuningStart].Date, data[testStart - 1].Date, data[testStart].Date, data[^1].Date,
            ".NET " + Environment.Version, Fit(selected, data), scores, testScore, baselineScore, error90, data,
            testScore.Mae <= baselineScore.Mae * 1.1 + 1e-8);
    }
}
