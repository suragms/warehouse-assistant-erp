using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml;
using SkiaSharp;
using SkiaSharp.HarfBuzz;

namespace PurchaseAssistant.Infrastructure.Services;

public record ReportColumn(string Label, string Format = "text", float Weight = 1);
public record ReportTable(string Title, string BusinessName, DateTime GeneratedAt, string Period,
    ReportColumn[] Columns, List<object?[]> Rows, string[] Notes);

public static partial class ExportFileBuilder
{
    public static string ReportText(object? value, string format = "text") => value switch
    {
        null => "-",
        DateTime date => date.ToUniversalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        decimal number => number.ToString(format == "money" ? "N2" : "0.####", CultureInfo.InvariantCulture),
        double number => number.ToString("0.####", CultureInfo.InvariantCulture),
        bool active => active ? "Active" : "Inactive",
        _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "-"
    };

    // No formulas or external relationships: strings are always inline string cells.
    public static byte[] ReportSpreadsheet(ReportColumn[] columns, IEnumerable<object?[]> source, string[]? information = null)
    {
        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            void Text(string name, string value) { using var writer = new StreamWriter(zip.CreateEntry(name).Open(), new UTF8Encoding(false)); writer.Write(value); }
            Text("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>".Replace("</Types>", information == null ? "</Types>" : "<Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>"));
            Text("_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
            Text("xl/workbook.xml", "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Report\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>".Replace("</sheets>", information == null ? "</sheets>" : "<sheet name=\"Report information\" sheetId=\"2\" r:id=\"rId3\"/></sheets>"));
            Text("xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>".Replace("</Relationships>", information == null ? "</Relationships>" : "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/></Relationships>"));
            Text("xl/styles.xml", "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"3\"><numFmt numFmtId=\"164\" formatCode=\"yyyy-mm-dd hh:mm\"/><numFmt numFmtId=\"165\" formatCode=\"#,##0.00\"/><numFmt numFmtId=\"166\" formatCode=\"0.####\"/></numFmts><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"5\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"><alignment wrapText=\"1\" vertical=\"top\"/></xf><xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\"/><xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyNumberFormat=\"1\"/><xf numFmtId=\"165\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyNumberFormat=\"1\"/><xf numFmtId=\"166\" fontId=\"0\" fillId=\"0\" borderId=\"0\" applyNumberFormat=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>");
            if (information != null)
            {
                using var infoStream = zip.CreateEntry("xl/worksheets/sheet2.xml").Open();
                using var info = XmlWriter.Create(infoStream, new XmlWriterSettings { Encoding = new UTF8Encoding(false) });
                const string infoNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
                info.WriteStartElement("worksheet", infoNs); info.WriteStartElement("cols", infoNs); info.WriteStartElement("col", infoNs); info.WriteAttributeString("min", "1"); info.WriteAttributeString("max", "1"); info.WriteAttributeString("width", "110"); info.WriteAttributeString("customWidth", "1"); info.WriteEndElement(); info.WriteEndElement();
                info.WriteStartElement("sheetData", infoNs);
                foreach (var value in information) { info.WriteStartElement("row", infoNs); info.WriteStartElement("c", infoNs); info.WriteAttributeString("t", "inlineStr"); info.WriteAttributeString("s", "0"); info.WriteStartElement("is", infoNs); info.WriteElementString("t", infoNs, new string(value.Where(XmlConvert.IsXmlChar).ToArray())); info.WriteEndElement(); info.WriteEndElement(); info.WriteEndElement(); }
                info.WriteEndElement(); info.WriteEndElement();
            }
            using var stream = zip.CreateEntry("xl/worksheets/sheet1.xml").Open();
            using var xml = XmlWriter.Create(stream, new XmlWriterSettings { Encoding = new UTF8Encoding(false) });
            const string ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            xml.WriteStartElement("worksheet", ns);
            xml.WriteStartElement("sheetViews", ns); xml.WriteStartElement("sheetView", ns); xml.WriteAttributeString("workbookViewId", "0");
            xml.WriteStartElement("pane", ns); xml.WriteAttributeString("ySplit", "1"); xml.WriteAttributeString("topLeftCell", "A2"); xml.WriteAttributeString("state", "frozen"); xml.WriteEndElement(); xml.WriteEndElement(); xml.WriteEndElement();
            xml.WriteStartElement("cols", ns);
            for (int i = 0; i < columns.Length; i++) { xml.WriteStartElement("col", ns); xml.WriteAttributeString("min", (i + 1).ToString()); xml.WriteAttributeString("max", (i + 1).ToString()); xml.WriteAttributeString("width", Math.Clamp(16 * columns[i].Weight, 14, 55).ToString(CultureInfo.InvariantCulture)); xml.WriteAttributeString("customWidth", "1"); xml.WriteEndElement(); }
            xml.WriteEndElement(); xml.WriteStartElement("sheetData", ns);
            var header = true;
            foreach (var row in new[] { columns.Select(x => (object?)x.Label).ToArray() }.Concat(source))
            {
                if (row.Length != columns.Length) throw new ArgumentException("Export column count mismatch.");
                xml.WriteStartElement("row", ns);
                for (int i = 0; i < row.Length; i++)
                {
                    var cell = row[i]; xml.WriteStartElement("c", ns);
                    xml.WriteAttributeString("s", header ? "1" : cell is DateTime or DateOnly ? "2" : cell is decimal or double or int or long ? columns[i].Format == "money" ? "3" : "4" : "0");
                    if (cell is DateTime date) xml.WriteElementString("v", ns, date.ToUniversalTime().ToOADate().ToString(CultureInfo.InvariantCulture));
                    else if (cell is DateOnly day) xml.WriteElementString("v", ns, day.ToDateTime(TimeOnly.MinValue).ToOADate().ToString(CultureInfo.InvariantCulture));
                    else if (cell is decimal or double or int or long) xml.WriteElementString("v", ns, Convert.ToString(cell, CultureInfo.InvariantCulture));
                    else { xml.WriteAttributeString("t", "inlineStr"); xml.WriteStartElement("is", ns); xml.WriteStartElement("t", ns); xml.WriteAttributeString("xml", "space", null, "preserve"); xml.WriteString(new string((cell == null ? "" : ReportText(cell)).Where(XmlConvert.IsXmlChar).ToArray())); xml.WriteEndElement(); xml.WriteEndElement(); }
                    xml.WriteEndElement();
                }
                xml.WriteEndElement(); header = false;
            }
            xml.WriteEndElement(); xml.WriteEndElement();
        }
        return output.ToArray();
    }

    private static SKTypeface Font(string name)
    {
        var assembly = typeof(ExportFileBuilder).Assembly;
        using var stream = assembly.GetManifestResourceStream($"PurchaseAssistant.Infrastructure.Fonts.{name}-Regular.ttf")
            ?? throw new InvalidOperationException("Report font asset is missing.");
        return SKTypeface.FromStream(stream);
    }

    public static byte[] ReportPdf(ReportTable report, CancellationToken ct = default)
    {
        if (report.Rows.Count > 10000 || report.Columns.Length is < 1 or > 16) throw new ArgumentException("Narrow the export filters.");
        if (report.Rows.Sum(r => r.Sum(c => ReportText(c).Length)) > 2_000_000 || report.Rows.Any(r => r.Any(c => ReportText(c).Length > 32767)))
            throw new ArgumentException("Report text is too large. Narrow the filters.");
        using var latin = Font("NotoSans"); using var malayalam = Font("NotoSansMalayalam"); using var arabic = Font("NotoSansArabic");
        using var latinShaper = new SKShaper(latin); using var malayalamShaper = new SKShaper(malayalam); using var arabicShaper = new SKShaper(arabic);
        using var paint = new SKPaint { IsAntialias = true, Color = SKColors.Black };
        using var fill = new SKPaint { Color = new SKColor(235, 244, 239) };
        using var rule = new SKPaint { Color = new SKColor(215, 222, 219), StrokeWidth = .5f };
        using var font = new SKFont(latin, 10);
        SKTypeface? Context(string text) => text.EnumerateRunes().Any(x => x.Value is >= 0x0600 and <= 0x06FF)
            && !text.EnumerateRunes().Any(x => x.Value is >= 'A' and <= 'Z' or >= 'a' and <= 'z') ? arabic : null;
        (SKTypeface Face, SKShaper Shaper) Face(string element, SKTypeface? context = null)
        {
            var selected = element.EnumerateRunes().Any(x => x.Value is >= 0x0D00 and <= 0x0D7F) ? (malayalam, malayalamShaper)
                : element.EnumerateRunes().Any(x => x.Value is >= 0x0600 and <= 0x06FF) ? (arabic, arabicShaper) : (latin, latinShaper);
            if (context == arabic && !element.EnumerateRunes().Any(Rune.IsLetter)) selected = (arabic, arabicShaper);
            font.Typeface = selected.Item1;
            if (element.Length > 0 && !font.ContainsGlyphs(element))
                throw new ArgumentException("PDF font coverage is unavailable for one or more characters. Use CSV or XLSX to retain the complete text.");
            return selected;
        }
        IEnumerable<string> Elements(string text)
        {
            var enumerator = StringInfo.GetTextElementEnumerator(text);
            while (enumerator.MoveNext()) yield return enumerator.GetTextElement();
        }
        float Width(string text)
        {
            float width = 0; var run = ""; SKTypeface? previous = null; var context = Context(text);
            foreach (var element in Elements(text).Append(""))
            {
                var face = Face(element, context);
                if (run.Length > 0 && (element == "" || previous != face.Face))
                {
                    var selected = previous == malayalam ? malayalamShaper : previous == arabic ? arabicShaper : latinShaper;
                    font.Typeface = previous!; width += selected.Shape(run, font).Width; run = "";
                }
                run += element; previous = face.Face;
            }
            return width;
        }

        List<string> Wrap(string text, float width)
        {
            var result = new List<string>(); var line = "";
            foreach (var word in text.Replace('\r', ' ').Replace('\n', ' ').Split(' '))
            {
                var candidate = line.Length == 0 ? word : line + " " + word;
                if (Width(candidate) <= width) { line = candidate; continue; }
                if (line.Length > 0) { result.Add(line); line = ""; }
                foreach (var element in Elements(word))
                {
                    if (line.Length > 0 && Width(line + element) > width) { result.Add(line); line = ""; }
                    line += element;
                }
            }
            result.Add(line); return result;
        }
        void Draw(SKCanvas canvas, string text, float x, float y, float size = 10)
        {
            font.Size = size;
            // Split scripts into runs so names containing both Latin and local script retain all glyphs.
            var run = ""; SKTypeface? previous = null; var context = Context(text);
            foreach (var element in Elements(text).Append(""))
            {
                var face = Face(element, context);
                if (run.Length > 0 && (element == "" || previous != face.Face))
                {
                    var selected = previous == malayalam ? malayalamShaper : previous == arabic ? arabicShaper : latinShaper;
                    font.Typeface = previous!; var shaped = selected.Shape(run, font);
                    canvas.DrawShapedText(selected, run, x, y, SKTextAlign.Left, font, paint); x += shaped.Width; run = "";
                }
                run += element; previous = face.Face;
            }
            font.Size = 10;
        }
        var landscape = report.Columns.Length > 5; float pageWidth = landscape ? 842 : 595, pageHeight = landscape ? 595 : 842;
        var widths = report.Columns.Select(x => (pageWidth - 64) * x.Weight / report.Columns.Sum(c => c.Weight)).ToArray();
        var header = report.Columns.Select((x, i) => Wrap(x.Label, widths[i] - 12)).ToArray();
        float headerHeight = header.Max(x => x.Count) * 14 + 12;
        var notes = report.Notes.SelectMany(x => Wrap(x, pageWidth - 64)).ToList();
        if (notes.Count > 10) throw new ArgumentException("Report notes are too long.");
        font.Size = 11; var businessLines = Wrap(report.BusinessName, pageWidth - 64); font.Size = 10;
        var headingExtra = (businessLines.Count - 1) * 14;
        float top = 112 + headingExtra + notes.Count * 14 + headerHeight, bottom = pageHeight - 40;
        int capacity = (int)((bottom - top - 12) / 14);
        if (capacity < 1) throw new ArgumentException("Report columns are too wide.");
        var pages = new List<List<(string[][] Lines, int Offset, int Count)>> { new() }; float used = 0;
        var allRows = report.Rows.Count == 0 ? new List<object?[]> { Enumerable.Repeat<object?>(null, report.Columns.Length).ToArray() } : report.Rows;
        foreach (var row in allRows)
        {
            ct.ThrowIfCancellationRequested(); if (row.Length != report.Columns.Length) throw new ArgumentException("Export column count mismatch.");
            var lines = row.Select((x, i) => Wrap(report.Rows.Count == 0 && i == 0 ? "No matching records." : ReportText(x, report.Columns[i].Format), widths[i] - 12).ToArray()).ToArray();
            if (report.Rows.Count == 0) lines = report.Columns.Select((_, i) => i == 0 ? new[] { "No matching records." } : Array.Empty<string>()).ToArray();
            int count = lines.Max(x => x.Length), offset = 0;
            while (offset < count)
            {
                int available = (int)((bottom - top - used - 12) / 14);
                if (available < 1 || (count - offset <= capacity && available < count - offset)) { pages.Add(new()); used = 0; available = capacity; }
                int take = Math.Min(count - offset, available); pages[^1].Add((lines, offset, take)); used += take * 14 + 12; offset += take;
                if (pages.Count > 500) throw new ArgumentException("Report exceeds 500 pages. Narrow the filters.");
            }
        }
        using var output = new MemoryStream(); using var document = SKDocument.CreatePdf(output);
        for (int p = 0; p < pages.Count; p++)
        {
            ct.ThrowIfCancellationRequested(); var canvas = document.BeginPage(pageWidth, pageHeight);
            Draw(canvas, report.Title, 32, 38, 18);
            for (int l = 0; l < businessLines.Count; l++) Draw(canvas, businessLines[l], 32, 58 + l * 14, 11);
            Draw(canvas, $"Generated {report.GeneratedAt:yyyy-MM-dd HH:mm:ss} UTC | {report.Period}", 32, 78 + headingExtra, 9);
            float y = 98 + headingExtra;
            foreach (var note in notes) { Draw(canvas, note, 32, y, 9); y += 14; }
            canvas.DrawRect(32, y, pageWidth - 64, headerHeight, fill); float x = 32;
            for (int c = 0; c < header.Length; c++) { for (int l = 0; l < header[c].Count; l++) Draw(canvas, header[c][l], x + 6, y + 16 + l * 14, 9); x += widths[c]; }
            y += headerHeight;
            foreach (var segment in pages[p])
            {
                x = 32;
                for (int c = 0; c < widths.Length; c++)
                {
                    for (int l = 0; l < segment.Count; l++) { var line = segment.Offset + l; if (line < segment.Lines[c].Length) Draw(canvas, segment.Lines[c][line], x + 6, y + 16 + l * 14); }
                    x += widths[c];
                }
                y += segment.Count * 14 + 12; canvas.DrawLine(32, y, pageWidth - 32, y, rule);
            }
            Draw(canvas, $"{report.Rows.Count} records | Warehouse Assistant ERP | UTC", 32, pageHeight - 18, 8);
            Draw(canvas, $"Page {p + 1} of {pages.Count}", pageWidth - 110, pageHeight - 18, 8); document.EndPage();
        }
        document.Close(); return output.ToArray();
    }
}
