using System.IO.Compression;
using System.Xml;
using System.Globalization;
using SkiaSharp;
namespace PurchaseAssistant.Infrastructure.Services;
public static partial class ExportFileBuilder
{
    public record CsvNumber(decimal Value, string Format = "0.####");
    public static byte[] Csv(string[] columns, IEnumerable<object?[]> rows, string? comment = null)
    {
        static string Cell(object? value)
        {
            var text = value switch { CsvNumber n => n.Value.ToString(n.Format, CultureInfo.InvariantCulture),
                decimal n => n.ToString("0.####", CultureInfo.InvariantCulture), _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "" };
            if (value is string && text.TrimStart(' ', '\t', '\r', '\n') is var clean && clean.Length > 0 && "=+@-".Contains(clean[0])) text = "'" + text;
            return text.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;
        }
        var csv = new System.Text.StringBuilder();
        if (comment != null) csv.Append(comment.Replace('\r', ' ').Replace('\n', ' ')).Append('\n');
        csv.AppendJoin(',', columns).Append('\n');
        foreach (var row in rows) { if (row.Length != columns.Length) throw new ArgumentException("CSV column count mismatch."); csv.AppendJoin(',', row.Select(Cell)).Append('\n'); }
        return new System.Text.UTF8Encoding(false).GetBytes(csv.ToString());
    }
    public static byte[] Spreadsheet(string[] columns, IEnumerable<object?[]> rows)
        => ReportSpreadsheet(columns.Select(x => new ReportColumn(x)).ToArray(), rows);
    public static byte[] Pdf(string title, IEnumerable<string> rows)
        => ReportPdf(new ReportTable(title, "Warehouse Assistant ERP", DateTime.UtcNow, "As generated (UTC)",
            [new("Details")], rows.Select(x => new object?[] { x }).ToList(), []));
}
