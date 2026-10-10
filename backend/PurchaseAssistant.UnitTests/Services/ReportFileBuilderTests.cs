using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using PurchaseAssistant.Infrastructure.Services;
using UglyToad.PdfPig;

namespace PurchaseAssistant.UnitTests.Services;
public class ReportFileBuilderTests
{
    [Fact]
    public void UncoveredUnicodeFailsClearlyInsteadOfSilentlyDroppingGlyphs()
    {
        var report = new ReportTable("Font coverage", "QA", DateTime.UtcNow, "Current snapshot", [new("Item")], [["CJK 测试"]], []);
        Assert.Contains("Use CSV or XLSX", Assert.Throws<ArgumentException>(() => ExportFileBuilder.ReportPdf(report)).Message);
        Assert.Contains("测试", Encoding.UTF8.GetString(ExportFileBuilder.Csv(["Item"], report.Rows)));
    }
    [Fact]
    public void ArabicAndMalayalamAreShapedUsingBundledFonts()
    {
        var report = new ReportTable("Script validation", "QA", DateTime.UtcNow, "Current snapshot", [new("Item name")], [["المخزون الحالي"], ["മലയാളം അരി"], ["Café ₹ Ελληνικά"]], []);
        var bytes = ExportFileBuilder.ReportPdf(report); using var pdf = PdfDocument.Open(bytes); Assert.Single(pdf.GetPages()); Assert.Contains("Café", pdf.GetPage(1).Text); Assert.Contains("₹", pdf.GetPage(1).Text);
        Assert.DoesNotContain("�", pdf.GetPage(1).Text);
        var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR"); if (qa != null) { Directory.CreateDirectory(qa); File.WriteAllBytes(Path.Combine(qa, "scripts.pdf"), bytes); }
    }
    [Fact]
    public void WorkbookInformationRetainsReportingPeriodBusinessAndDefinedTotals()
    {
        var bytes = ExportFileBuilder.ReportSpreadsheet([new("Amount INR", "money")], [[123.4567m]], ["Business QA", "2026-10-01 through 2026-10-10 UTC", "Total INR 123.46"]);
        using var zip = new ZipArchive(new MemoryStream(bytes)); using var reader = new StreamReader(zip.GetEntry("xl/worksheets/sheet2.xml")!.Open()); var text = reader.ReadToEnd();
        Assert.Contains("Business QA", text); Assert.Contains("Total INR 123.46", text); Assert.Contains("UTC", text);
    }
    [Fact]
    public void MultiplePagesRetainAllRowsRepeatHeadersAndIncludePageCounts()
    {
        var rows = Enumerable.Range(0, 120).Select(i => new object?[] { "ROW-" + i.ToString("D3"), string.Concat(Enumerable.Repeat("Long café item, quoted \"name\" and ₹ symbol ", 7)), i + .1234m }).ToList();
        var table = new ReportTable("Layout validation", "Warehouse QA", DateTime.UtcNow, "Current snapshot", [new("Identifier"), new("Item name", Weight: 3), new("Quantity")], rows, ["Test fixtures only."]);
        var bytes = ExportFileBuilder.ReportPdf(table); using var pdf = PdfDocument.Open(bytes); Assert.True(pdf.NumberOfPages > 2);
        var pages = pdf.GetPages().ToList(); var text = string.Join("\n", pages.Select(x => x.Text));
        foreach (var row in rows) Assert.Contains((string)row[0]!, text);
        for (int i = 0; i < pages.Count; i++) { Assert.Contains("Item name", pages[i].Text); Assert.Contains($"Page {i + 1} of {pages.Count}", pages[i].Text); Assert.DoesNotContain("�", pages[i].Text); }
        Assert.Contains("café", text); Assert.Contains("₹", text);
        var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR"); if (qa != null) { Directory.CreateDirectory(qa); File.WriteAllBytes(Path.Combine(qa, "layout-multiple-pages.pdf"), bytes); }
    }
    [Fact]
    public void VeryLongCellContinuesAcrossPagesWithoutDroppingTextAndEmptyReportIsExplicit()
    {
        var table = new ReportTable("Long cell", "QA", DateTime.UtcNow, "Current snapshot", [new("Details")], [[new string('W', 12000) + " UNIQUE-END-MARKER"]], []);
        using var pdf = PdfDocument.Open(ExportFileBuilder.ReportPdf(table)); Assert.True(pdf.NumberOfPages > 1); Assert.Contains("UNIQUE-END-MARKER", string.Join("", pdf.GetPages().Select(x => x.Text)));
        using var empty = PdfDocument.Open(ExportFileBuilder.ReportPdf(table with { Rows = [] })); Assert.Contains("No matching records.", empty.GetPage(1).Text);
        var qa = Environment.GetEnvironmentVariable("WA_EXPORT_QA_DIR"); if (qa != null) { Directory.CreateDirectory(qa); File.WriteAllBytes(Path.Combine(qa, "empty.pdf"), ExportFileBuilder.ReportPdf(table with { Rows = [] })); }
    }
    [Fact]
    public void SpreadsheetUsesTypedDatesDecimalsWidthsAndLiteralFormulaStrings()
    {
        var bytes = ExportFileBuilder.ReportSpreadsheet([new("Date"), new("Amount INR", "money"), new("Item", Weight: 3)], [[new DateTime(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc), 123.4567m, "  =HYPERLINK(\"danger\")\nമലയാളം"]]);
        using var zip = new ZipArchive(new MemoryStream(bytes)); using var stream = zip.GetEntry("xl/worksheets/sheet1.xml")!.Open(); var document = XDocument.Load(stream);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"; var row = document.Descendants(ns + "row").Last(); var cells = row.Elements(ns + "c").ToList();
        Assert.Equal("2", cells[0].Attribute("s")!.Value); Assert.NotNull(cells[0].Element(ns + "v")); Assert.Equal("3", cells[1].Attribute("s")!.Value); Assert.Equal("123.4567", cells[1].Element(ns + "v")!.Value);
        Assert.Equal("inlineStr", cells[2].Attribute("t")!.Value); Assert.Contains("=HYPERLINK", cells[2].Value); Assert.Empty(document.Descendants(ns + "f")); Assert.Equal(3, document.Descendants(ns + "col").Count());
    }
    [Fact]
    public void CsvEscapesUnicodeNewlinesAndWhitespacePrefixedFormulasButPreservesNumericSigns()
    {
        var csv = Encoding.UTF8.GetString(ExportFileBuilder.Csv(["Item", "Change"], [[" \t=HYPERLINK(\"x\")", -1.2345m], ["Café, മലയാളം\nquoted \"name\"", 5m]]));
        Assert.Contains("' \t=HYPERLINK", csv); Assert.Contains(",-1.2345", csv); Assert.Contains("Café, മലയാളം", csv); Assert.Contains("\"\"name\"\"", csv);
    }
}
