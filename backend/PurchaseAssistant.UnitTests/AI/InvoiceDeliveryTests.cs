using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Web.Services;
using Xunit;
namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    [Theory] [InlineData(Role.Owner, true)] [InlineData(Role.Staff, false)]
    public async Task InvoicePreviewIsReadOnlyScopedAndHidesFinancialSuggestions(Role role, bool finance)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        var item = new CatalogItem { BusinessId = BusinessId, Name = "Rice", DefaultUnit = "kg" };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Add(item); db.Add(new CatalogItem { BusinessId = Guid.NewGuid(), Name = "Foreign item", DefaultUnit = "kg" }); await db.SaveChangesAsync(); }
        var response = await client.PostAsJsonAsync("/api/v1/ai/invoice-text", new { text = "Rice 10 kg @ 50\nForeign item 2 kg @ 100\nIncomplete row" }); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, body.GetProperty("items").GetArrayLength()); var row = body.GetProperty("items")[0]; Assert.Equal(10, row.GetProperty("quantity").GetDecimal()); Assert.Equal(finance, row.TryGetProperty("rate", out _));
        Assert.Equal(item.Id, row.GetProperty("catalogItemId").GetGuid()); Assert.Equal(JsonValueKind.Null, body.GetProperty("items")[1].GetProperty("catalogItemId").ValueKind);
        using var check = factory.Services.CreateScope(); var saved = check.ServiceProvider.GetRequiredService<AppDbContext>(); Assert.Empty(await saved.Purchases.IgnoreQueryFilters().ToListAsync()); Assert.Empty(await saved.StockMovements.IgnoreQueryFilters().ToListAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/ai/invoice-text", new { text = new string('x', 20001) })).StatusCode);
    }
    [Theory] [InlineData(null, 401)] [InlineData("catalog.view", 403)]
    public async Task InvoiceCannotBypassAuthenticationOrCurrentPermission(string? permission, int status)
    {
        using var factory = new Factory { Permission = permission ?? "" }; using var client = factory.CreateClient();
        if (permission != null) client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        Assert.Equal((HttpStatusCode)status, (await client.PostAsJsonAsync("/api/v1/ai/invoice-text", new { text = "Rice 2 kg 50" })).StatusCode);
    }
    [Theory] [InlineData(Role.Staff)] [InlineData(Role.Manager)] [InlineData(Role.Admin)]
    public async Task WhatsAppIsOwnerOnlyAtBothReadAndSendBoundary(Role role)
    {
        using var factory = new Factory { Permission = "purchase.view", MemberRole = role }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        var path = $"/api/v1/purchases/{Guid.NewGuid()}/delivery/whatsapp";
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(path, new { confirmed = true })).StatusCode);
    }
    [Fact] public async Task RestrictedDashboardAndNotificationsDoNotLeakRevokedResourceAccess()
    {
        using var factory = new Factory { Permission = "catalog.view", RealDashboard = true }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Add(new CatalogItem { BusinessId = BusinessId, Name = "Secret item" }); db.Add(new Notification { BusinessId = BusinessId, UserId = UserId, Type = NotificationType.LowStock, Title = "Secret item" }); db.Add(new PurchaseOrder { BusinessId = BusinessId, OrderNumber = "Secret order" }); await db.SaveChangesAsync(); }
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); foreach (var type in new[] { "CatalogItem", "PurchaseOrder", "MlPrediction", "Membership", "DamageReport" }) db.Add(new Notification { BusinessId = BusinessId, UserId = UserId, Type = NotificationType.System, ReferenceType = type, Title = "Secret " + type }); await db.SaveChangesAsync(); }
        var dashboard = await client.GetStringAsync("/api/v1/dashboard"); Assert.DoesNotContain("Secret", dashboard);
        var notifications = await client.GetStringAsync("/api/v1/notifications"); Assert.DoesNotContain("Secret", notifications);
        Assert.Equal(0, JsonDocument.Parse(await client.GetStringAsync("/api/v1/notifications/unread-count")).RootElement.GetProperty("count").GetInt32());
    }
}
public class WhatsAppContractTests
{
    [Theory] [InlineData("ok", "accepted")] [InlineData("reject", "failed")] [InlineData("ambiguous", "unknown")] [InlineData("upload", "failed")]
    public async Task DeliveryUsesBoundedOfficialTransportAuditsAndNeverAutomaticallyReplays(string mode, string expected)
    {
        var business = Guid.NewGuid(); var tenant = new Mock<ITenantProvider>(); tenant.Setup(x => x.GetBusinessId()).Returns(business);
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, tenant.Object);
        var item = new CatalogItem { BusinessId = business, Name = "Rice" }; var order = new PurchaseOrder { BusinessId = business, OrderNumber = "PO-TEST", Status = PurchaseStatus.Confirmed, Items = [new PurchaseItem { BusinessId = business, CatalogItem = item, CatalogItemId = item.Id, OrderedQuantity = 2, Unit = "kg", UnitPrice = 98765 }] };
        db.Add(order); await db.SaveChangesAsync();
        var user = new Mock<ICurrentUserService>(); user.SetupGet(x => x.BusinessId).Returns(business); user.SetupGet(x => x.UserId).Returns(Guid.NewGuid()); user.SetupGet(x => x.Role).Returns("Owner");
        var credentials = new Mock<IProviderCredentialResolver>();
        credentials.Setup(x => x.ResolveAsync("whatsapp_api_key", It.IsAny<CancellationToken>())).ReturnsAsync("test-only-key");
        credentials.Setup(x => x.ResolveAsync("whatsapp_phone_number_id", It.IsAny<CancellationToken>())).ReturnsAsync("1234567890");
        credentials.Setup(x => x.ResolveAsync("whatsapp_staff_number", It.IsAny<CancellationToken>())).ReturnsAsync("919999999999");
        var handler = new DeliveryHandler(mode); var factory = new Mock<IHttpClientFactory>(); factory.Setup(x => x.CreateClient("WhatsApp")).Returns(() => new HttpClient(handler, false));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["WhatsApp:Enabled"] = "true", ["WhatsApp:GraphVersion"] = "v23.0" }).Build();
        var service = new WhatsAppDeliveryService(db, user.Object, credentials.Object, config, factory.Object);
        var request = new DeliveryRequest(Guid.NewGuid(), order.Version, null, "919999999999", true);
        await Assert.ThrowsAsync<ArgumentException>(() => service.Send(order.Id, request with { Confirmed = false }, default)); Assert.Equal(0, handler.Calls);
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.Send(Guid.NewGuid(), request, default));
        var row = await service.Send(order.Id, request, default); Assert.Equal(expected, row.Status);
        var count = handler.Calls; Assert.Equal(row.Id, (await service.Send(order.Id, request, default)).Id); Assert.Equal(count, handler.Calls);
        if (expected == "unknown") await Assert.ThrowsAsync<InvalidOperationException>(() => service.Send(order.Id, request with { RequestId = Guid.NewGuid(), DeliveryVersion = row.Version }, default));
        Assert.Equal(2, await db.SecurityAuditLogs.CountAsync()); Assert.DoesNotContain("test-only-key", JsonSerializer.Serialize(await db.SecurityAuditLogs.ToListAsync()));
        if (mode == "ok") {
            row.Status = "sending"; row.UpdatedAt = DateTime.UtcNow; await db.SaveChangesAsync();
            var retry = request with { RequestId = Guid.NewGuid(), DeliveryVersion = row.Version, VerifiedNotDelivered = true };
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.Send(order.Id, retry, default));
            row.UpdatedAt = DateTime.UtcNow.AddMinutes(-3); await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.Send(order.Id, retry with { VerifiedNotDelivered = false }, default));
            Assert.Equal(count, handler.Calls);
            Assert.Equal("accepted", (await service.Send(order.Id, retry, default)).Status); Assert.Equal(count + 2, handler.Calls);
        }
    }
    private sealed class DeliveryHandler(string mode) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++; Assert.Equal("graph.facebook.com", request.RequestUri!.Host); Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            if (request.RequestUri.AbsolutePath.EndsWith("/media")) {
                Assert.Contains("application/pdf", await request.Content!.ReadAsStringAsync(ct));
                return new(mode == "upload" ? HttpStatusCode.BadRequest : HttpStatusCode.OK) { Content = new StringContent("{\"id\":\"media-test\"}") };
            }
            var body = await request.Content!.ReadAsStringAsync(ct); Assert.Contains("document", body); Assert.DoesNotContain("98765", body);
            return new(mode == "reject" ? HttpStatusCode.BadRequest : mode == "ambiguous" ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK) { Content = new StringContent("{\"messages\":[{\"id\":\"message-test\"}]}") };
        }
    }
}
