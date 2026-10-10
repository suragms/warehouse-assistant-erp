using Microsoft.EntityFrameworkCore;

using PurchaseAssistant.Application.DTOs.Catalog;

using PurchaseAssistant.Application.Interfaces;

using PurchaseAssistant.Domain.Entities;

using PurchaseAssistant.Infrastructure.Data;

using PurchaseAssistant.Infrastructure.Services;



namespace PurchaseAssistant.UnitTests.Services;



public class BarcodeServiceTests : IDisposable

{

    private readonly Guid business = Guid.NewGuid(), foreign = Guid.NewGuid();

    private readonly AppDbContext db;

    private readonly DbContextOptions<AppDbContext> options;

    private readonly CatalogService service;

    private readonly CatalogItem item, other;

    private readonly Category category;

    private readonly Actor actor;

    public BarcodeServiceTests()

    {

        actor = new(business);

        options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;

        using (var seed = new AppDbContext(options))

        {

            category = new() { BusinessId = business, Name = "Food" };

            item = new() { BusinessId = business, CategoryId = category.Id, Name = "Rice", ItemCode = "R01", CurrentStock = 25, PhysicalStock = 22, ReservedStock = 3 };

            other = new() { BusinessId = business, CategoryId = category.Id, Name = "Other", ItemCode = "R02", Barcode = "TAKEN", IsActive = false };

            seed.AddRange(category, item, other, new User { Id = actor.UserId!.Value, Name = "Owner" }); seed.SaveChanges();

        }

        db = new(options, actor, actor);

        service = new(db, new EntityNormalizationService(), actor);

    }

    public void Dispose() => db.Dispose();

    [Fact]

    public async Task AssignmentReassignmentUnlinkAndLookupPreserveInventoryAndAuditValues()

    {

        var result = await service.AssignBarcodeAsync(item.Id, new() { Barcode = " 00123 ", ExpectedVersion = item.RowVersion });

        Assert.Equal("Food", result.CategoryName); Assert.Equal("00123", result.Barcode); Assert.Equal(25, result.CurrentStock); Assert.NotEqual(item.RowVersion, result.RowVersion);

        Assert.Equal(item.Id, (await service.GetByBarcodeAsync(" 00123 "))!.Id);

        var changed = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "ABC", ExpectedVersion = result.RowVersion });

        Assert.Null(await service.GetByBarcodeAsync("00123"));

        var unchanged = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "ABC", ExpectedVersion = changed.RowVersion });

        Assert.Equal(changed.RowVersion, unchanged.RowVersion);

        var cleared = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "   ", ExpectedVersion = changed.RowVersion });

        Assert.Null(cleared.Barcode); Assert.Null(await service.GetByBarcodeAsync("ABC"));

        var stored = await db.CatalogItems.SingleAsync(i => i.Id == item.Id);

        Assert.Equal(25, stored.CurrentStock); Assert.Equal(22, stored.PhysicalStock); Assert.Equal(3, stored.ReservedStock);

        Assert.Equal("R01", stored.ItemCode); Assert.Equal("Rice", stored.Name);

        Assert.Empty(await db.StockMovements.ToListAsync()); Assert.Empty(await db.PurchaseItems.ToListAsync());

        var logs = await db.SecurityAuditLogs.ToListAsync(); Assert.Equal(3, logs.Count);

        Assert.Contains(logs, l => l.MetadataJson!.Contains("00123") && l.MetadataJson!.Contains("ABC"));

        Assert.All(logs, l => { Assert.DoesNotContain("CurrentStock", l.MetadataJson); Assert.DoesNotContain("ReservedStock", l.MetadataJson); });

    }

    [Fact]

    public async Task DuplicateArchivedReservationAndStaleVersionNeverOverwrite()

    {

        var duplicate = await Assert.ThrowsAsync<InvalidOperationException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = " TAKEN ", ExpectedVersion = item.RowVersion }));

        Assert.Equal("DUPLICATE_BARCODE", duplicate.Message);

        var stale = await Assert.ThrowsAsync<InvalidOperationException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = "NEW", ExpectedVersion = Guid.NewGuid() }));

        Assert.Equal("CATALOG_ITEM_VERSION_CONFLICT", stale.Message);

        await Assert.ThrowsAsync<ArgumentException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = "NEW" }));

        Assert.Null((await db.CatalogItems.SingleAsync(i => i.Id == item.Id)).Barcode);

        Assert.Empty(await db.SecurityAuditLogs.ToListAsync());

    }

    [Theory]

    [InlineData("bad\ncode")] [InlineData("code\n")] [InlineData("bad\tcode")] [InlineData("é")]

    public async Task InvalidAssignmentCannotWrite(string barcode)

    {

        await Assert.ThrowsAsync<ArgumentException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = barcode, ExpectedVersion = item.RowVersion }));

        Assert.Empty(await db.SecurityAuditLogs.ToListAsync());

    }

    [Fact]

    public async Task LengthLimitAndExactCasePreserveLeadingZeroes()

    {

        await Assert.ThrowsAsync<ArgumentException>(() => service.AssignBarcodeAsync(item.Id, new() { Barcode = new string('A', 101), ExpectedVersion = item.RowVersion }));

        var assigned = await service.AssignBarcodeAsync(item.Id, new() { Barcode = new string('A', 100), ExpectedVersion = item.RowVersion });

        Assert.Equal(100, assigned.Barcode!.Length);

        assigned = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "abc", ExpectedVersion = assigned.RowVersion });

        Assert.Null(await service.GetByBarcodeAsync("ABC")); Assert.NotNull(await service.GetByBarcodeAsync("abc"));

        Assert.Null(await service.GetByBarcodeAsync("123"));

        await Assert.ThrowsAsync<ArgumentException>(() => service.GetByBarcodeAsync("  "));

    }

    [Fact]

    public async Task ForeignItemCannotBeReadMutatedOrGenerateAndSameCodeCanExistAcrossBusinesses()

    {

        using var unscoped = new AppDbContext(options);

        // Use a separate unscoped context only to construct a foreign fixture.

        var foreignCategory = new Category { BusinessId = foreign, Name = "Elsewhere" };

        var foreignItem = new CatalogItem { BusinessId = foreign, CategoryId = foreignCategory.Id, ItemCode = "F1", Name = "Foreign", Barcode = "FOREIGN" };

        unscoped.AddRange(foreignCategory, foreignItem); await unscoped.SaveChangesAsync();

        Assert.Null(await service.GetByBarcodeAsync("FOREIGN"));

        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.AssignBarcodeAsync(foreignItem.Id, new() { Barcode = "HACK", ExpectedVersion = foreignItem.RowVersion }));

        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GenerateBarcodeAsync(foreignItem.Id, foreignItem.RowVersion));

        var local = await service.AssignBarcodeAsync(item.Id, new() { Barcode = "FOREIGN", ExpectedVersion = item.RowVersion });

        Assert.Equal(item.Id, (await service.GetByBarcodeAsync(local.Barcode!))!.Id);

    }

    [Fact]

    public async Task GenerationIsPrintableUniqueAndNeverOverwritesExistingOrArchivedItem()

    {

        var generated = await service.GenerateBarcodeAsync(item.Id, item.RowVersion);

        Assert.Matches("^WA-[A-F0-9]{32}$", generated.Barcode!);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => service.GenerateBarcodeAsync(item.Id, generated.RowVersion));

        Assert.Equal("CATALOG_ITEM_BARCODE_EXISTS", error.Message);

        error = await Assert.ThrowsAsync<InvalidOperationException>(() => service.GenerateBarcodeAsync(other.Id, other.RowVersion));

        Assert.Equal("CATALOG_ITEM_INACTIVE", error.Message);

        Assert.Equal(25, (await db.CatalogItems.SingleAsync(i => i.Id == item.Id)).CurrentStock);

    }

    [Fact]

    public async Task CreateAndFullUpdateUseTheSameValidatorAndSearchFindsBarcode()

    {

        var dto = new CatalogItemDto { ItemCode = "NEW", Name = "New", CategoryId = category.Id, IsActive = true, Barcode = " TAKEN " };

        Assert.Equal("DUPLICATE_BARCODE", (await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(dto))).Message);

        dto.Barcode = "ABC/001?x";

        var created = await service.CreateAsync(dto); Assert.Equal("ABC/001?x", created.Barcode);

        Assert.Equal(created.Id, (await service.GetAllAsync(search: "001?")).Data.Single().Id);

        dto.RowVersion = created.RowVersion; dto.Barcode = "bad\ncode";

        await Assert.ThrowsAsync<ArgumentException>(() => service.UpdateAsync(created.Id, dto));

    }

    private sealed class Actor(Guid business) : ICurrentUserService, ITenantProvider

    {

        public Guid? BusinessId => business; public Guid? UserId { get; } = Guid.NewGuid();

        public string Role => "Owner"; public string Email => "barcode@test.local";

        public IEnumerable<string> Permissions => []; public bool HasPermission(string permission) => true;

        public Guid GetBusinessId() => business;

    }

}

