using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.AI;
using Xunit;

namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    [Fact] public async Task ContactSearchIsPagedValidatedAndTenantScoped()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("supplier.view", true));
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            for (var i = 0; i < 3; i++) {
                db.Suppliers.Add(new() { BusinessId = BusinessId, Name = "Paged supplier " + i });
                db.Brokers.Add(new() { BusinessId = BusinessId, Name = "Paged broker " + i });
            }
            db.Suppliers.Add(new() { BusinessId = Guid.NewGuid(), Name = "Paged foreign secret" }); await db.SaveChangesAsync();
        }
        var first = await client.GetFromJsonAsync<List<SupplierDto>>("/api/v1/catalog/suppliers?search=Paged&page=1&pageSize=2");
        var second = await client.GetFromJsonAsync<List<SupplierDto>>("/api/v1/catalog/suppliers?search=Paged&page=2&pageSize=2");
        Assert.NotNull(first); Assert.NotNull(second);
        Assert.Equal(2, first.Count); Assert.Single(second); Assert.DoesNotContain(first, x => second.Any(y => y.Id == x.Id));
        Assert.DoesNotContain(first.Concat(second), x => x.Name.Contains("secret"));
        Assert.Single((await client.GetFromJsonAsync<List<BrokerDto>>("/api/v1/catalog/brokers?search=Paged&page=2&pageSize=2"))!);
        foreach (var path in new[] { "suppliers?page=0", "brokers?pageSize=1001", "suppliers?search=" + new string('a', 201) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/catalog/" + path)).StatusCode);
    }
}

public class AiResilienceTests
{
    [Fact] public async Task ConfiguredRetryAndCircuitAreTenantScopedAndResetAfterSuccess()
    {
        var id = Guid.NewGuid(); var policy = new AiProviderPolicy { ProviderOrder = ["OpenAI"], Models = new() { ["OpenAI"] = "configured-model" }, Retries = 1 };
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Businesses.Add(new() { Id = id, Name = "Synthetic resilience fixture", AiSettingsJson = JsonSerializer.Serialize(policy) }); await db.SaveChangesAsync();
        var user = new Mock<ICurrentUserService>(); user.SetupGet(x => x.BusinessId).Returns(id);
        var provider = new Mock<IAIProvider>(); var factory = new Mock<IAIProviderFactory>();
        factory.Setup(x => x.GetProviderAsync(AIProviderType.OpenAI, It.IsAny<CancellationToken>())).ReturnsAsync(provider.Object);
        provider.Setup(x => x.SendRequestAsync(It.IsAny<AIRequest>(), It.IsAny<CancellationToken>())).ReturnsAsync(new AIResponse(false, null, "failure", "OpenAI", "model", 0));
        var clock = new Mock<TimeProvider>(); var now = DateTimeOffset.UtcNow; clock.Setup(x => x.GetUtcNow()).Returns(() => now);
        var circuit = new AiCircuitBreaker(clock.Object);
        var routing = new AIRoutingService(factory.Object, Mock.Of<ILogger<AIRoutingService>>(), Options.Create(new AiOptions { Enabled = true }), settings: new(db, user.Object), circuit: circuit);
        var request = new AIRequest("instruction", "synthetic text");
        for (var i = 0; i < 4; i++) Assert.False((await routing.ExecuteWithFailoverAsync(request)).Success);
        provider.Verify(x => x.SendRequestAsync(It.Is<AIRequest>(r => r.ModelOverride == "configured-model"), It.IsAny<CancellationToken>()), Times.Exactly(6));
        Assert.False(circuit.IsOpen("another-tenant")); now = now.AddSeconds(61);
        provider.Setup(x => x.SendRequestAsync(It.IsAny<AIRequest>(), It.IsAny<CancellationToken>())).ReturnsAsync(new AIResponse(true, "{}", null, "OpenAI", "model", 0));
        Assert.True((await routing.ExecuteWithFailoverAsync(request)).Success);
        Assert.True((await routing.ExecuteWithFailoverAsync(request)).Success);
        provider.Verify(x => x.SendRequestAsync(It.IsAny<AIRequest>(), It.IsAny<CancellationToken>()), Times.Exactly(8));
    }
}
