using PurchaseAssistant.Domain.Common;

namespace PurchaseAssistant.Domain.Entities;

// Immutable source provenance. ImportedAt is never backdated to the historical observation time.
public class HistoricalUsageBatch : TenantEntity
{
    public Guid ImportedById { get; set; }
    public DateTime ImportedAt { get; set; }
    public string Source { get; set; } = "";
    public string FileHash { get; set; } = "";
    public string RawCsv { get; set; } = "";
    public int RowCount { get; set; }
}

// Each row is an attested COMPLETE daily total, not an individual stock transaction.
public class HistoricalUsageRow : TenantEntity
{
    public Guid BatchId { get; set; }
    public Guid CatalogItemId { get; set; }
    public DateOnly Date { get; set; }
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "";
    public DateTime SourceRecordedAt { get; set; }
}
