using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Services;

namespace PurchaseAssistant.UnitTests.ML;

public class MovementAnomalyTests
{
    [Fact] public void RollingHistoryMatchesCausalTypeDirectionThresholdsAndEqualTimeIsolation()
    {
        var now = DateTime.UtcNow;
        var rows = Enumerable.Range(0, 2000).Select(i => new StockMovement { CreatedAt = now.AddHours(i - 2000), MovementType = "usage", QuantityDelta = i % 17 == 0 ? -2 : -1 }).ToList();
        var high = new StockMovement { CreatedAt = now.AddHours(-1), MovementType = "usage", QuantityDelta = -100 };
        var simultaneous = Enumerable.Range(0, 10).Select(_ => new StockMovement { CreatedAt = high.CreatedAt, MovementType = "new-type", QuantityDelta = -100 }).ToList();
        rows.Add(high); rows.AddRange(simultaneous); rows.Add(new() { CreatedAt = now, MovementType = "usage", QuantityDelta = 100 });
        var actual = MlService.AnalyzeMovementHistory(rows, now); Assert.Contains(actual, x => x.Id == high.Id); Assert.DoesNotContain(actual, x => simultaneous.Any(y => y.Id == x.Id));
        Assert.DoesNotContain(actual, x => x.Quantity > 0);
        // Compare selected IDs with the previous strictly-earlier reference calculation, including equal-time rows.
        var expected = rows.Where(x => x.CreatedAt >= now.AddDays(-30)).Where(row => {
            var prior = rows.Where(x => x.CreatedAt < row.CreatedAt && x.MovementType == row.MovementType && x.QuantityDelta * row.QuantityDelta > 0)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(60).Select(x => Math.Abs((double)x.QuantityDelta)).Order().ToArray();
            if (prior.Length < 20) return false;
            var median = prior[prior.Length / 2]; var madValues = prior.Select(x => Math.Abs(x - median)).Order().ToArray(); var mad = madValues[madValues.Length / 2];
            return mad > 0 ? .67448975 * Math.Abs(Math.Abs((double)row.QuantityDelta) - median) / mad >= 3.5 : median > 0 && Math.Abs((double)row.QuantityDelta) > median * 3;
        }).OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(50).Select(x => x.Id).ToArray();
        Assert.Equal(expected, actual.Select(x => x.Id));
    }
}
