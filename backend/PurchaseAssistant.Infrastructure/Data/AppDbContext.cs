using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using System;
using System.Reflection;

namespace PurchaseAssistant.Infrastructure.Data
{
    public partial class AppDbContext : DbContext
    {
        private readonly ITenantProvider? _tenantProvider;
        private readonly ICurrentUserService? _auditUser;

        public AppDbContext(DbContextOptions<AppDbContext> options, ITenantProvider? tenantProvider = null, ICurrentUserService? auditUser = null) : base(options)
        {
            _tenantProvider = tenantProvider;
            _auditUser = auditUser;
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Business> Businesses => Set<Business>();
        public DbSet<Membership> Memberships => Set<Membership>();
        public DbSet<Category> Categories => Set<Category>();
        public DbSet<CategoryType> CategoryTypes => Set<CategoryType>();
        public DbSet<CatalogItem> CatalogItems => Set<CatalogItem>();
        public DbSet<CatalogVariant> CatalogVariants => Set<CatalogVariant>();
        public DbSet<SupplierItem> SupplierItems => Set<SupplierItem>();
        public DbSet<BrokerSupplier> BrokerSuppliers => Set<BrokerSupplier>();
        public DbSet<SupplierItemPrice> SupplierItemPrices => Set<SupplierItemPrice>();
        public DbSet<Supplier> Suppliers => Set<Supplier>();
        public DbSet<Broker> Brokers => Set<Broker>();
        public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
        public DbSet<SecurityAuditLog> SecurityAuditLogs => Set<SecurityAuditLog>();
        public DbSet<StockMovement> StockMovements => Set<StockMovement>();
        public DbSet<PurchaseOrder> Purchases => Set<PurchaseOrder>();
        public DbSet<PurchaseItem> PurchaseItems => Set<PurchaseItem>();
        public DbSet<Notification> Notifications => Set<Notification>();
        public DbSet<PurchaseDamageReport> PurchaseDamageReports => Set<PurchaseDamageReport>();
        public DbSet<DailyUsageLog> DailyUsageLogs => Set<DailyUsageLog>();
        public DbSet<MlPredictionLog> MlPredictionLogs => Set<MlPredictionLog>();
        public DbSet<DailyOperationSnapshot> DailyOperationSnapshots => Set<DailyOperationSnapshot>();
        public DbSet<BackupLog> BackupLogs => Set<BackupLog>();
        public DbSet<AiUsageLog> AiUsageLogs => Set<AiUsageLog>();

        public Guid CurrentBusinessId => _tenantProvider?.GetBusinessId() ?? Guid.Empty;

        private void ProtectStockLedger()
        {
            if (ChangeTracker.Entries<HistoricalUsageBatch>().Any(e => e.State is EntityState.Modified or EntityState.Deleted)
                || ChangeTracker.Entries<HistoricalUsageRow>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
                throw new InvalidOperationException("Historical import provenance is immutable.");
            if (ChangeTracker.Entries<SecurityAuditLog>().Any(e => e.State is EntityState.Modified or EntityState.Deleted)
                || ChangeTracker.Entries<MlPredictionLog>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
                throw new InvalidOperationException("Audit and prediction history are immutable.");
            if (ChangeTracker.Entries<StockMovement>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
                throw new InvalidOperationException("Stock movements are immutable. Record a correcting movement instead.");
            if (ChangeTracker.Entries<BackupLog>().Any(e => e.State is EntityState.Modified or EntityState.Deleted)
                || ChangeTracker.Entries<AiUsageLog>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
                throw new InvalidOperationException("Integration history is immutable.");
        }

        public override int SaveChanges(bool acceptAllChangesOnSuccess)
        {
            return SaveChangesAsync(acceptAllChangesOnSuccess).GetAwaiter().GetResult();
        }

        public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
        {
            ProtectStockLedger();
            await using var transaction = Database.IsRelational() && Database.CurrentTransaction == null ? await Database.BeginTransactionAsync(cancellationToken) : null;
            var notifications = await PrepareMutationRecordsAsync(cancellationToken);
            if (!Database.IsRelational()) Notifications.AddRange(notifications);
            var result = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
            // ON CONFLICT makes concurrent producers idempotent without aborting the domain mutation.
            if (Database.IsRelational()) foreach (var n in notifications)
                await Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "Notifications" ("Id", "BusinessId", "UserId", "Type", "Title", "Message", "IsRead", "CreatedAt", "ReferenceType", "ReferenceId", "DedupeKey")
                    VALUES ({n.Id}, {n.BusinessId}, {n.UserId}, {n.Type.ToString()}, {n.Title}, {n.Message}, false, {n.CreatedAt}, {n.ReferenceType}, {n.ReferenceId}, {n.DedupeKey})
                    ON CONFLICT DO NOTHING
                    """, cancellationToken);
            if (transaction != null) await transaction.CommitAsync(cancellationToken);
            return result;
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());
            ConfigureTenantRelationships(modelBuilder);
            ConfigureHistoricalUsage(modelBuilder);
            modelBuilder.Entity<MlPredictionLog>(e => {
                e.HasQueryFilter(x => x.BusinessId == CurrentBusinessId);
                e.HasOne<CatalogItem>().WithMany().HasForeignKey(x => new { x.BusinessId, x.CatalogItemId }).HasPrincipalKey(x => new { x.BusinessId, x.Id }).OnDelete(DeleteBehavior.Restrict);
                e.HasIndex(x => new { x.BusinessId, x.CatalogItemId, x.CreatedAt });
                e.HasIndex(x => new { x.BusinessId, x.CatalogItemId, x.StartDate, x.Horizon, x.ModelVersion, x.InputVersion }).IsUnique().HasDatabaseName("IX_MlPredictionLogs_UniqueForecast");
                e.Property(x => x.ModelVersion).HasMaxLength(160);
                e.Property(x => x.InputVersion).HasMaxLength(64);
                e.Property(x => x.PredictedQuantity).HasPrecision(20, 4);
                e.Property(x => x.DailyPredictionsJson).HasColumnType("jsonb");
            });

            modelBuilder.Entity<BackupLog>(e => {
                e.HasQueryFilter(x => x.BusinessId == CurrentBusinessId);
                e.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
                e.HasIndex(x => new { x.BusinessId, x.CreatedAt });
                e.Property(x => x.RunType).HasMaxLength(32); e.Property(x => x.Status).HasMaxLength(32);
                e.Property(x => x.FilePath).HasMaxLength(128); e.Property(x => x.ErrorMessage).HasMaxLength(256);
                e.Property(x => x.RowCountsJson).HasColumnType("jsonb");
            });
            modelBuilder.Entity<AiUsageLog>(e => {
                e.HasQueryFilter(x => x.BusinessId == CurrentBusinessId);
                e.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
                e.HasIndex(x => new { x.BusinessId, x.CreatedAt });
                e.Property(x => x.Feature).HasMaxLength(64); e.Property(x => x.Endpoint).HasMaxLength(128);
                e.Property(x => x.Provider).HasMaxLength(64); e.Property(x => x.Model).HasMaxLength(128);
            });

            modelBuilder.Entity<UserSettings>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<StaffTask>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<ProviderCredential>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<PurchaseDelivery>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            // Multi-tenant Query Filters
            modelBuilder.Entity<Category>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<CategoryType>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<CatalogItem>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<CatalogVariant>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<SupplierItem>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<BrokerSupplier>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<SupplierItemPrice>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<Supplier>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<Broker>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<SecurityAuditLog>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<StockMovement>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<PurchaseOrder>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<PurchaseItem>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<Notification>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<PurchaseDamageReport>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<ChecklistTemplate>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<ChecklistCompletion>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<DailyUsageLog>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
            modelBuilder.Entity<DailyOperationSnapshot>().HasQueryFilter(e => e.BusinessId == CurrentBusinessId);
        }

        private static void ConfigureTenantRelationships(ModelBuilder model)
        {
            // Include business in relational keys so raw/direct EF writes cannot link another tenant's row.
            model.Entity<CategoryType>().HasOne(e => e.Category).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CategoryId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<CatalogItem>().HasOne(e => e.Category).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CategoryId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<CatalogItem>().HasOne(e => e.Type).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CategoryId, e.TypeId }).HasPrincipalKey(e => new { e.BusinessId, e.CategoryId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<CatalogItem>().HasOne(e => e.LastSupplier).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.LastSupplierId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<CatalogItem>().HasOne(e => e.LastBroker).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.LastBrokerId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<CatalogVariant>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<SupplierItem>().HasOne(e => e.Supplier).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.SupplierId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<SupplierItem>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<BrokerSupplier>().HasOne(e => e.Broker).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.BrokerId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<BrokerSupplier>().HasOne(e => e.Supplier).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.SupplierId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<SupplierItemPrice>().HasOne(e => e.Supplier).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.SupplierId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<SupplierItemPrice>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<SupplierItemPrice>().HasOne<PurchaseOrder>().WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.SourcePurchaseId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<PurchaseOrder>().HasOne(e => e.Supplier).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.SupplierId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<PurchaseOrder>().HasOne(e => e.Broker).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.BrokerId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<PurchaseOrder>().HasMany(e => e.Items).WithOne(e => e.PurchaseOrder)
                .HasForeignKey(e => new { e.BusinessId, e.PurchaseOrderId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Cascade);
            model.Entity<PurchaseItem>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<StockMovement>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
            model.Entity<PurchaseDamageReport>().HasOne(e => e.PurchaseOrder).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.PurchaseOrderId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Cascade);
            model.Entity<PurchaseDamageReport>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.SetNull);
            model.Entity<DailyUsageLog>().HasOne(e => e.CatalogItem).WithMany()
                .HasForeignKey(e => new { e.BusinessId, e.CatalogItemId }).HasPrincipalKey(e => new { e.BusinessId, e.Id }).OnDelete(DeleteBehavior.Restrict);
        }
    }
}
