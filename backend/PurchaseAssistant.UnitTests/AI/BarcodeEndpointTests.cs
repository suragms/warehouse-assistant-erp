using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    private async Task<CatalogItem> SeedBarcodeItem(Factory factory, Guid? business = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var category = new Category { BusinessId = business ?? BusinessId, Name = "Barcode category" };
        var item = new CatalogItem { BusinessId = category.BusinessId, CategoryId = category.Id, Name = "Barcode rice", ItemCode = Guid.NewGuid().ToString("N"), CurrentStock = 50, PhysicalStock = 45, ReservedStock = 5 };
        db.AddRange(category, item); await db.SaveChangesAsync(); return item;
    }
    [Theory]
    [InlineData("catalog.view", true, HttpStatusCode.Forbidden)]
    [InlineData("catalog.edit", false, HttpStatusCode.Forbidden)]
    public async Task BarcodeMutationRequiresServerPermissionAndBusiness(string permission, bool business, HttpStatusCode expected)
    {
        using var factory = new Factory { Permission = permission, MemberRole = Role.Staff };
        using var client = factory.CreateClient(); var item = await SeedBarcodeItem(factory);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(permission, business));
        Assert.Equal(expected, (await client.PatchAsJsonAsync($"/api/v1/catalog/items/{item.Id}/barcode", new { barcode = "X", expectedVersion = item.RowVersion })).StatusCode);
        Assert.Equal(expected, (await client.PostAsJsonAsync($"/api/v1/catalog/items/{item.Id}/barcode/generate", new { expectedVersion = item.RowVersion })).StatusCode);
    }
    [Fact]
    public async Task BarcodeHttpRequiresAuthenticationAndLookupPermission()
    {
        using var factory = new Factory { Permission = "catalog.edit" }; using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=X")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("catalog.edit", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=X")).StatusCode);
    }
    [Fact]
    public async Task BarcodeHttpAssignsValidatesConflictsAndNeverLeaksForeignOrConflictingItem()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient();
        var item = await SeedBarcodeItem(factory); var other = await SeedBarcodeItem(factory);
        var foreign = await SeedBarcodeItem(factory, Guid.NewGuid());
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("catalog.edit", true));
        var path = $"/api/v1/catalog/items/{item.Id}/barcode";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync(path, new { expectedVersion = item.RowVersion })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync(path, new { barcode = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync(path, new { barcode = "bad\ncode", expectedVersion = item.RowVersion })).StatusCode);
        var response = await client.PatchAsJsonAsync(path, new { barcode = " ABC/001?x ", expectedVersion = item.RowVersion });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        var version = data.GetProperty("rowVersion").GetGuid();
        Assert.Equal(50, data.GetProperty("currentStock").GetDecimal());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsJsonAsync(path, new { barcode = "NEW", expectedVersion = item.RowVersion })).StatusCode);
        var conflict = await client.PatchAsJsonAsync($"/api/v1/catalog/items/{other.Id}/barcode", new { barcode = "ABC/001?x", expectedVersion = other.RowVersion });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var conflictText = await conflict.Content.ReadAsStringAsync(); Assert.Contains("DUPLICATE_BARCODE", conflictText); Assert.DoesNotContain(item.Id.ToString(), conflictText);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PatchAsJsonAsync($"/api/v1/catalog/items/{foreign.Id}/barcode", new { barcode = "BAD", expectedVersion = foreign.RowVersion })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=ABC%2F001%3Fx")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=abc%2F001%3Fx")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=bad%0Acode")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync(path, new { barcode = (string?)null, expectedVersion = version })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/catalog/items/by-barcode?barcode=ABC%2F001%3Fx")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stored = await db.CatalogItems.IgnoreQueryFilters().SingleAsync(i => i.Id == item.Id);
        Assert.Equal(50, stored.CurrentStock); Assert.Equal(45, stored.PhysicalStock); Assert.Equal(5, stored.ReservedStock);
        Assert.Empty(await db.StockMovements.IgnoreQueryFilters().ToListAsync());
    }
}
