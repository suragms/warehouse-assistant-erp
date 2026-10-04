using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using Xunit;

namespace PurchaseAssistant.UnitTests.AI;

public partial class PurchaseIntentEndpointTests
{
    [Theory] [InlineData("/ml/items")] [InlineData("/ml/items/11111111-1111-1111-1111-111111111111")] [InlineData("/ml/items/11111111-1111-1111-1111-111111111111/monitoring")] [InlineData("/ml/items/11111111-1111-1111-1111-111111111111/monitoring-summary")]
    public async Task MlRequiresAuthenticationBusinessAndCurrentPermission(string path)
    {
        using var factory = new Factory { Permission = "catalog.view" }; using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1" + path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", false)); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1" + path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true)); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1" + path)).StatusCode);
    }
    [Theory] [InlineData(Role.Owner)] [InlineData(Role.Staff)]
    public async Task MlIsTenantScopedAndExplainsInsufficientHistory(Role role)
    {
        using var factory = new Factory { Permission = "stock.view", MemberRole = role }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var local = new CatalogItem { BusinessId = BusinessId, Name = "Local", ItemCode = "LOC" }; var foreign = new CatalogItem { BusinessId = Guid.NewGuid(), Name = "Private", ItemCode = "HIDDEN" };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.AddRange(local, foreign); await db.SaveChangesAsync(); }
        var items = await client.GetStringAsync("/api/v1/ml/items"); Assert.Contains("Local", items); Assert.DoesNotContain("Private", items);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/ml/items/{foreign.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/ml/items/{foreign.Id}/monitoring")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/ml/items/{foreign.Id}/monitoring-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/v1/ml/items/{local.Id}?horizon=999")).StatusCode);
        var result = await client.GetFromJsonAsync<MlAnalysis>($"/api/v1/ml/items/{local.Id}"); Assert.Equal("insufficient_history", result!.Status); Assert.Empty(result.Forecast); Assert.Null(result.Reorder);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/ml/items?pageSize=100000")).StatusCode);
    }
}
