using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.ML;

namespace PurchaseAssistant.Infrastructure.Services;

public static class UsageObservationReader
{
    // Bounded groups avoid extraction's previous two-queries-per-item growth. Unit changes invalidate imported labels.
    public static async Task<Dictionary<Guid, List<UsageObservation>>> ReadAsync(AppDbContext db, Guid business,
        IReadOnlyDictionary<Guid, string> items, DateOnly from, DateOnly until, CancellationToken ct = default)
    {
        var result = items.Keys.ToDictionary(id => id, _ => new List<UsageObservation>());
        foreach (var chunk in items.Keys.Chunk(100)) {
            var daily = await db.DailyUsageLogs.AsNoTracking().Where(x => x.BusinessId == business && chunk.Contains(x.CatalogItemId) && x.Date >= from && x.Date < until)
                .OrderBy(x => x.CatalogItemId).ThenBy(x => x.Date).Take(150001).Select(x => new { x.CatalogItemId, x.Date, x.UsedQty, x.IsConfirmed, x.LoggedAt }).ToListAsync(ct);
            if (daily.Count > 150000) throw new InvalidOperationException("Usage extraction exceeded the supported bounded history.");
            foreach (var row in daily) result[row.CatalogItemId].Add(new(row.Date, (double)row.UsedQty, row.IsConfirmed, row.LoggedAt));
            var imported = await db.HistoricalUsageRows.AsNoTracking().Where(x => x.BusinessId == business && chunk.Contains(x.CatalogItemId) && x.Date >= from && x.Date < until)
                .OrderBy(x => x.CatalogItemId).ThenBy(x => x.Date).Take(73001).Select(x => new { x.CatalogItemId, x.Date, x.Quantity, x.Unit, x.SourceRecordedAt }).ToListAsync(ct);
            if (imported.Count > 73000) throw new InvalidOperationException("Imported extraction exceeded the supported bounded history.");
            foreach (var row in imported) if (row.Unit == items[row.CatalogItemId]) result[row.CatalogItemId].Add(new(row.Date, (double)row.Quantity, true, row.SourceRecordedAt));
        }
        if (result.Values.Any(x => x.Count > 1500)) throw new InvalidOperationException("One item has excessive duplicate usage history. Resolve its source data before extraction.");
        return result;
    }
}
