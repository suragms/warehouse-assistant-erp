using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Domain.Entities;

namespace PurchaseAssistant.Infrastructure.Data;

public partial class AppDbContext
{
    public DbSet<HistoricalUsageBatch> HistoricalUsageBatches => Set<HistoricalUsageBatch>();
    public DbSet<HistoricalUsageRow> HistoricalUsageRows => Set<HistoricalUsageRow>();
    private void ConfigureHistoricalUsage(ModelBuilder model)
    {
        model.Entity<HistoricalUsageBatch>(e => {
            e.HasQueryFilter(x => x.BusinessId == CurrentBusinessId);
            e.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
            e.HasAlternateKey(x => new { x.BusinessId, x.Id });
            e.HasIndex(x => new { x.BusinessId, x.FileHash }).IsUnique();
            e.Property(x => x.Source).HasMaxLength(200);
            e.Property(x => x.FileHash).HasMaxLength(64);
        });
        model.Entity<HistoricalUsageRow>(e => {
            e.HasQueryFilter(x => x.BusinessId == CurrentBusinessId);
            e.HasOne<HistoricalUsageBatch>().WithMany().HasForeignKey(x => new { x.BusinessId, x.BatchId }).HasPrincipalKey(x => new { x.BusinessId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CatalogItem>().WithMany().HasForeignKey(x => new { x.BusinessId, x.CatalogItemId }).HasPrincipalKey(x => new { x.BusinessId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.BusinessId, x.CatalogItemId, x.Date }).IsUnique();
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Quantity).HasPrecision(20, 4);
            e.ToTable(t => t.HasCheckConstraint("CK_HistoricalUsage_Quantity", "\"Quantity\" >= 0 AND \"Quantity\" <= 1000000000"));
        });
    }
}
