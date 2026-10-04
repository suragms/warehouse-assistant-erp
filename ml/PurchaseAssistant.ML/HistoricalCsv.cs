using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace PurchaseAssistant.ML;

public record HistoricalRecord(int Row, Guid ItemId, DateOnly Date, decimal Quantity, string Unit, DateTime RecordedAt);
public record ImportError(int Row, string Message);
public record HistoricalValidation(List<HistoricalRecord> Records, List<ImportError> Errors, int TotalRows, string Hash);

public static class HistoricalCsv
{
    public const int MaxBytes = 2_000_000;
    public const int MaxRows = 5000;
    public const string Header = "business_id,warehouse_id,item_id,date,quantity,unit,transaction_type,recorded_at";
    public static HistoricalValidation Validate(string csv, Guid business, DateTime now)
    {
        if (business == Guid.Empty || string.IsNullOrWhiteSpace(csv) || Encoding.UTF8.GetByteCount(csv) > MaxBytes)
            throw new ArgumentException("Choose a nonempty consumption CSV of at most 2 MB.");
        var table = Parse(csv.TrimStart('\uFEFF'));
        if (table.Count == 0 || !table[0].SequenceEqual(Header.Split(','))) throw new ArgumentException("CSV columns must match the documented daily consumption template.");
        if (table.Count - 1 is < 1 or > MaxRows) throw new ArgumentException("Import between 1 and 5000 daily rows per file.");
        var today = DateOnly.FromDateTime(now); var records = new List<HistoricalRecord>(); var errors = new List<ImportError>();
        var seen = new HashSet<(Guid, DateOnly)>();
        for (var i = 1; i < table.Count; i++) {
            var fields = table[i]; var row = i + 1;
            if (fields.Length != 8) { errors.Add(new(row, "Expected eight columns.")); continue; }
            if (!Guid.TryParse(fields[0], out var tenant) || !Guid.TryParse(fields[1], out var warehouse) || tenant != business || warehouse != business) {
                errors.Add(new(row, "Business and warehouse must match your selected business.")); continue;
            }
            if (!Guid.TryParse(fields[2], out var item) || item == Guid.Empty) { errors.Add(new(row, "Invalid item identifier.")); continue; }
            if (!DateOnly.TryParseExact(fields[3], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date >= today || date < today.AddDays(-730)) {
                errors.Add(new(row, "Date must be a completed UTC day within the last 730 days (yyyy-MM-dd).")); continue;
            }
            if (!decimal.TryParse(fields[4], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var quantity) || quantity is < 0 or > 1_000_000_000 || decimal.Round(quantity, 4) != quantity) {
                errors.Add(new(row, "Quantity must be nonnegative, at most 1000000000, with at most four decimals.")); continue;
            }
            if (string.IsNullOrWhiteSpace(fields[5]) || fields[5].Length > 20) { errors.Add(new(row, "Invalid unit.")); continue; }
            if (fields[6] != "consumption_daily_total") { errors.Add(new(row, "Only complete consumption_daily_total records are eligible. Purchases and corrections are not demand.")); continue; }
            if (!DateTime.TryParseExact(fields[7], ["yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'"], CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var recorded) || recorded > now || DateOnly.FromDateTime(recorded) != date) {
                errors.Add(new(row, "recorded_at must be the original source UTC timestamp on the consumption date. Late corrections are ineligible.")); continue;
            }
            if (!seen.Add((item, date))) { errors.Add(new(row, "Duplicate item/date daily total.")); continue; }
            records.Add(new(row, item, date, quantity, fields[5], recorded));
        }
        if (records.Select(x => x.ItemId).Distinct().Count() > 100) throw new ArgumentException("Import at most 100 items per file.");
        return new(records, errors, table.Count - 1, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(csv))).ToLowerInvariant());
    }
    // Strict RFC-style quoted CSV, bounded by Validate before parsing. No spreadsheet formulas are evaluated.
    private static List<string[]> Parse(string text)
    {
        var result = new List<string[]>(); var fields = new List<string>(); var value = new StringBuilder(); var quoted = false; var closed = false;
        for (var i = 0; i < text.Length; i++) {
            var c = text[i];
            if (quoted) {
                if (c == '"') { if (i + 1 < text.Length && text[i + 1] == '"') { value.Append('"'); i++; } else { quoted = false; closed = true; } }
                else value.Append(c);
                continue;
            }
            if (c == '"') { if (value.Length != 0 || closed) throw new ArgumentException("Malformed CSV quoting."); quoted = true; continue; }
            if (c is ',' or '\r' or '\n') {
                fields.Add(value.ToString()); value.Clear(); closed = false;
                if (c != ',') {
                    if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                    result.Add(fields.ToArray()); fields.Clear();
                    if (result.Count > MaxRows + 1) throw new ArgumentException("CSV row limit exceeded.");
                }
            } else { if (closed) throw new ArgumentException("Malformed CSV quoting."); value.Append(c); }
        }
        if (quoted) throw new ArgumentException("Unclosed CSV quote.");
        if (value.Length > 0 || fields.Count > 0 || closed) { fields.Add(value.ToString()); result.Add(fields.ToArray()); }
        return result;
    }
}
