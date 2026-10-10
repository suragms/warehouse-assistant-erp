using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Web.Services;
using Xunit;

namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    [Fact] public async Task ConfiguredRecoveryQueuesWithoutAccountEnumerationAndRevokesExistingSession()
    {
        using var factory = new Factory(); var sender = new Mock<IRecoveryMailSender>(); sender.SetupGet(x => x.Available).Returns(true);
        using var configured = factory.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddScoped(_ => sender.Object)));
        using var client = configured.CreateClient();
        var known = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "endpoint@test.local" });
        var unknown = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "unknown@test.local" });
        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode); Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.True(known.Headers.CacheControl!.NoStore);
        string token;
        using (var scope = configured.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var row = await db.Set<PasswordRecovery>().SingleAsync();
            token = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>().CreateProtector("PasswordRecovery.Outbox.v1").Unprotect(row.ProtectedToken);
        }
        var response = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { email = "endpoint@test.local", token, newPassword = "new-strong-password" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { email = "endpoint@test.local", token, newPassword = "other-password" })).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        sender.Verify(x => x.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
