using Microsoft.EntityFrameworkCore;
using Npgsql;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using System.Text.Json;

namespace PurchaseAssistant.IntegrationTests.Stock;

public sealed class BarcodeIntegrationTests : IAsyncLifetime
{
    private readonly Guid business = Guid.NewGuid(), foreign = Guid.NewGuid(), user = Guid.NewGuid();
    private DbContextOptions<AppDbContext> options = null!;
    private CatalogItem item = null!, other = null!, foreignItem = null!;
    private Actor actor = null!;
    private AppDbContext Context(bool audit = true) => new(options, actor, audit ? actor : null);
    private CatalogService Service(AppDbContext db) => new(db, new EntityNormalizationService(), actor);
    public async Task InitializeAsync()
    {
        options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(DisposablePostgres.ConnectionString).Options;
        actor = new(business, user);
        await using var seed = new AppDbContext(options);
        var category = new Category { BusinessId = business, Name = "Food" };
        var foreignCategory = new Category { BusinessId = foreign, Name = "Foreign food" };
        item = new() { BusinessId = business, CategoryId = category.Id, Name = "Rice", ItemCode = "R1", CurrentStock = 25, PhysicalStock = 22, ReservedStock = 3 };
        other = new() { BusinessId = business, CategoryId = category.Id, Name = "Other", ItemCode = "R2", Barcode = "TAKEN", IsActive = false };
        foreignItem = new() { BusinessId = foreign, CategoryId = foreignCategory.Id, Name = "Foreign", ItemCode = "R1", Barcode = "ABC" };
        var supplier = new Supplier { BusinessId = business, Name = "Supplier" };
        var order = new PurchaseOrder { BusinessId = business, SupplierId = supplier.Id, OrderNumber = "BARCODE-TEST", GrandTotal = 80 };
        seed.AddRange(new Business { Id = business, Name = "Barcode tests" }, new Business { Id = foreign, Name = "Foreign barcode tests" },
            new User { Id = user, Name = "Actor", Email = $"barcode-{user}@test.local" }, category, foreignCategory, supplier, order, item, other, foreignItem,
            new StockMovement { BusinessId = business, CatalogItemId = item.Id, CreatedById = user, MovementType = "AdjustmentIncrease", QuantityBefore = 0, QuantityAfter = 25, QuantityDelta = 25 },
            new PurchaseItem { BusinessId = business, PurchaseOrderId = order.Id, CatalogItemId = item.Id, OrderedQuantity = 4, UnitPrice = 20, LineTotal = 80 });
        await seed.SaveChangesAsync();
    }
    public async Task DisposeAsync()
    {
        await using var db = new AppDbContext(options);
        // Every ID was generated for this fixture, in the guarded disposable database.
        foreach (var table in new[] { "SecurityAuditLogs", "Notifications", "StockMovements", "PurchaseItems", "Purchases", "CatalogItems", "Suppliers", "Categories", "Businesses" })
        {
            // SQL identifiers come exclusively from the fixed allowlist above; values remain parameters.
            var sql = $$"""DELETE FROM "{{table}}" WHERE "{{(table == "Businesses" ? "Id" : "BusinessId")}}" IN ({0}, {1})""";
            await db.Database.ExecuteSqlRawAsync(sql, business, foreign);
        }
        await db.Database.ExecuteSqlRawAsync("""DELETE FROM "Users" WHERE "Id" = {0}""", user);
    }
    [RequiresDisposablePostgresFact]
    public async Task ExactLookupTenantIsolationReassignmentAndAuditingLeaveInventoryHistoryUnchanged()
    {
        await using var db = Context(); var service = Service(db);
        var ledger = JsonSerializer.Serialize(await db.StockMovements.AsNoTracking().ToListAsync());
        var lines = JsonSerializer.Serialize(await db.PurchaseItems.AsNoTracking().ToListAsync());
        var orders = JsonSerializer.Serialize(await db.Purchases.AsNoTracking().ToListAsync());
        var assigned = await service.AssignBarcodeAsync(item.Id, new() { Barcode = " ABC ", ExpectedVersion = item.RowVersion });
        Assert.Equal(item.Id, (await service.GetByBarcodeAsync("ABC"))!.Id);
        Assert.Null(await service.GetByBarcodeAsync("abc"));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.AssignBarcodeAsync(foreignItem.Id, new() { Barcode = "X", ExpectedVersion = foreignItem.RowVersion }));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GenerateBarcodeAsync(foreignItem.Id, foreignItem.RowVersion));
        var changed = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "00123", ExpectedVersion = assigned.RowVersion });
        Assert.Null(await service.GetByBarcodeAsync("ABC")); Assert.Null(await service.GetByBarcodeAsync("123"));
        Assert.Equal(item.Id, (await service.GetByBarcodeAsync("00123"))!.Id);
        await service.AssignBarcodeAsync(item.Id, new() { Barcode = null, ExpectedVersion = changed.RowVersion });
        Assert.Null(await service.GetByBarcodeAsync("00123"));
        db.ChangeTracker.Clear(); var stored = await db.CatalogItems.SingleAsync(i => i.Id == item.Id);
        Assert.Equal(25, stored.CurrentStock); Assert.Equal(22, stored.PhysicalStock); Assert.Equal(3, stored.ReservedStock);
        Assert.Equal(ledger, JsonSerializer.Serialize(await db.StockMovements.AsNoTracking().ToListAsync()));
        Assert.Equal(lines, JsonSerializer.Serialize(await db.PurchaseItems.AsNoTracking().ToListAsync()));
        Assert.Equal(orders, JsonSerializer.Serialize(await db.Purchases.AsNoTracking().ToListAsync()));
        var audit = await db.SecurityAuditLogs.ToListAsync(); Assert.Equal(3, audit.Count);
        Assert.Contains(audit, a => a.MetadataJson!.Contains("ABC") && a.MetadataJson!.Contains("00123"));
    }
    [RequiresDisposablePostgresFact]
    public async Task PostgreSqlUniqueIndexReservesArchivedCodesButAllowsCaseVariantsAndOtherTenants()
    {
        await using var db = Context(); var service = Service(db);
        Assert.Equal("DUPLICATE_BARCODE", (await Assert.ThrowsAsync<InvalidOperationException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = "TAKEN", ExpectedVersion = item.RowVersion }))).Message);
        await service.AssignBarcodeAsync(item.Id, new() { Barcode = "ABC", ExpectedVersion = item.RowVersion });
        await using var raw = Context(false); var archived = await raw.CatalogItems.SingleAsync(i => i.Id == other.Id);
        archived.Barcode = "ABC";
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => raw.SaveChangesAsync());
        Assert.Equal("23505", ((PostgresException)ex.InnerException!).SqlState);
        Assert.Equal("IX_CatalogItems_BusinessId_Barcode", ((PostgresException)ex.InnerException!).ConstraintName);
        raw.ChangeTracker.Clear(); archived = await raw.CatalogItems.SingleAsync(i => i.Id == other.Id); archived.Barcode = "abc"; await raw.SaveChangesAsync();
        Assert.Equal(other.Id, (await service.GetByBarcodeAsync("abc"))!.Id);
        Assert.False((await service.GetByBarcodeAsync("abc"))!.IsActive);
    }
    [RequiresDisposablePostgresFact]
    public async Task ConcurrentAssignmentsHaveOneWinnerAndNoDuplicateOrStockMutation()
    {
        await using (var seed = Context(false)) { var second = await seed.CatalogItems.SingleAsync(i => i.Id == other.Id); second.Barcode = null; second.IsActive = true; await seed.SaveChangesAsync(); }
        async Task<string> Attempt(Guid id, Guid version)
        {
            await using var db = Context();
            try { await Service(db).AssignBarcodeAsync(id, new() { Barcode = "RACE", ExpectedVersion = version }); return "OK"; }
            catch (InvalidOperationException ex) { return ex.Message; }
        }
        var results = await Task.WhenAll(Attempt(item.Id, item.RowVersion), Attempt(other.Id, other.RowVersion));
        Assert.Single(results, r => r == "OK"); Assert.Single(results, r => r == "DUPLICATE_BARCODE");
        await using var verify = Context(); Assert.Equal(1, await verify.CatalogItems.CountAsync(i => i.Barcode == "RACE"));
        Assert.Equal(1, await verify.SecurityAuditLogs.CountAsync()); Assert.Equal(25, (await verify.CatalogItems.SingleAsync(i => i.Id == item.Id)).CurrentStock);
    }
    [RequiresDisposablePostgresFact]
    public async Task ConcurrentSameItemEditsRejectStaleVersionAtomically()
    {
        await using var first = Context(); await using var second = Context();
        await second.CatalogItems.SingleAsync(i => i.Id == item.Id);
        var saved = await Service(first).AssignBarcodeAsync(item.Id, new() { Barcode = "WINNER", ExpectedVersion = item.RowVersion });
        Assert.Equal("CATALOG_ITEM_VERSION_CONFLICT", (await Assert.ThrowsAsync<InvalidOperationException>(() => Service(second).AssignBarcodeAsync(item.Id, new() { Barcode = "LOSER", ExpectedVersion = item.RowVersion }))).Message);
        await using var verify = Context(); Assert.Equal(saved.RowVersion, (await verify.CatalogItems.SingleAsync(i => i.Id == item.Id)).RowVersion);
        Assert.Equal(1, await verify.SecurityAuditLogs.CountAsync());
    }
    [RequiresDisposablePostgresFact]
    public async Task GenerationKeepsUniqueIndexAndMigrationModelAligned()
    {
        await using var db = Context(); Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        var generated = await Service(db).GenerateBarcodeAsync(item.Id, item.RowVersion);
        Assert.Matches("^WA-[A-F0-9]{32}$", generated.Barcode!);
        Assert.Equal("CATALOG_ITEM_BARCODE_EXISTS", (await Assert.ThrowsAsync<InvalidOperationException>(() => Service(db).GenerateBarcodeAsync(item.Id, generated.RowVersion))).Message);
        Assert.Equal(25, generated.CurrentStock);
    }
    private sealed class Actor(Guid business, Guid user) : ICurrentUserService, ITenantProvider
    {
        public Guid? UserId => user; public Guid? BusinessId => business; public string Role => "Owner";
        public string Email => "barcode@test.local"; public IEnumerable<string> Permissions => [];
        public bool HasPermission(string permission) => true; public Guid GetBusinessId() => business;
    }
}
