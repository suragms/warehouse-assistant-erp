using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.AI;
using PurchaseAssistant.Web.Services;
using SkiaSharp;
using Xunit;

namespace PurchaseAssistant.UnitTests.AI;
public class Phase5MediaTests
{
    private static MediaTextRequest ImageInput()
    {
        using var bitmap = new SKBitmap(2, 2); bitmap.Erase(SKColors.White); using var image = SKImage.FromBitmap(bitmap); using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return new(Convert.ToBase64String(data.ToArray()), "image/png", true);
    }
    private static MediaTextRequest VoiceInput() => new(Convert.ToBase64String(Encoding.ASCII.GetBytes("RIFF0000WAVEfixture-audio")), "audio/wav", true);
    private sealed class Handler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public int Calls; public string? Url, Body, Credential;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++; Url = request.RequestUri!.ToString(); Body = await request.Content!.ReadAsStringAsync(ct);
            Credential = request.Headers.Authorization?.Parameter ?? request.Headers.GetValues("x-goog-api-key").FirstOrDefault();
            return new(status) { Content = new StringContent(body) };
        }
    }
    [Theory, InlineData(true), InlineData(false)]
    public async Task MediaUsesTenantCredentialExplicitModelAndCorrectContract(bool image)
    {
        using var handler = new Handler(HttpStatusCode.OK, image ? "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":\"Rice 10 kg @ 50\"}]}}]}" : "{\"text\":\"Buy 10 kg rice\"}");
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = await Service(db, handler);
        var result = await service.ExtractAsync(image, image ? ImageInput() : VoiceInput(), default);
        Assert.Contains(image ? "Rice" : "Buy", result.Text); Assert.Equal("tenant-fixture-key", handler.Credential); Assert.Equal(1, handler.Calls);
        Assert.Contains(image ? "models/vision-test:generateContent" : "audio/transcriptions", handler.Url);
        Assert.Contains(image ? "inlineData" : "speech-test", handler.Body); Assert.Contains(image ? "image/png" : "audio/wav", handler.Body);
    }
    [Theory, InlineData(401), InlineData(429), InlineData(500), InlineData(302)]
    public async Task ProviderFailuresNeverExposeBodiesOrRetry(int status)
    {
        using var handler = new Handler((HttpStatusCode)status, "secret raw provider body");
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = await Service(db, handler); var error = await Assert.ThrowsAsync<MediaProviderException>(() => service.ExtractAsync(true, ImageInput(), default));
        Assert.DoesNotContain("secret", error.Message); Assert.Equal(1, handler.Calls);
    }
    [Theory, InlineData("{}"), InlineData("not-json"), InlineData("{\"text\":\"\"}"), InlineData("{\"text\":42}")]
    public async Task MalformedProviderResponsesFailExplicitly(string body)
    {
        using var handler = new Handler(HttpStatusCode.OK, body);
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = await Service(db, handler); await Assert.ThrowsAsync<MediaProviderException>(() => service.ExtractAsync(false, VoiceInput(), default));
    }
    [Fact] public async Task DisabledPolicyMissingConsentAndInvalidMediaNeverSend()
    {
        using var handler = new Handler(HttpStatusCode.OK, "{}");
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = await Service(db, handler, false);
        await Assert.ThrowsAsync<ArgumentException>(() => service.ExtractAsync(true, ImageInput() with { ConfirmExternalProcessing = false }, default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.ExtractAsync(true, ImageInput() with { ContentType = "image/svg+xml" }, default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.ExtractAsync(false, VoiceInput() with { ContentBase64 = "not-base64" }, default));
        Assert.Equal(503, (await Assert.ThrowsAsync<MediaProviderException>(() => service.ExtractAsync(true, ImageInput(), default))).Status);
        Assert.Equal(0, handler.Calls);
    }
    [Fact] public void OversizedAndDisguisedFilesAreRejected()
    {
        Assert.Throws<ArgumentException>(() => MediaTextService.Validate(new(new string('A', 7_000_000), "image/png", true), true));
        Assert.Throws<ArgumentException>(() => MediaTextService.Validate(new(Convert.ToBase64String(Encoding.UTF8.GetBytes("<svg>not-an-image</svg>")), "image/png", true), true));
        Assert.Throws<ArgumentException>(() => MediaTextService.Validate(VoiceInput() with { ContentType = "audio/mpeg" }, false));
    }
    private static async Task<MediaTextService> Service(AppDbContext db, Handler handler, bool enabled = true)
    {
        var business = new Business { Name = "Synthetic media test", AiSettingsJson = "{\"Enabled\":" + enabled.ToString().ToLowerInvariant() + "}" }; db.Businesses.Add(business); await db.SaveChangesAsync();
        var current = new Mock<ICurrentUserService>(); current.SetupGet(x => x.BusinessId).Returns(business.Id);
        var credentials = new Mock<IProviderCredentialResolver>(); credentials.Setup(x => x.ResolveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync("tenant-fixture-key");
        var clients = new Mock<IHttpClientFactory>(); clients.Setup(x => x.CreateClient("Media")).Returns(new HttpClient(handler) { MaxResponseContentBufferSize = 128000 });
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Media:Ocr:Enabled"] = "true", ["Media:Voice:Enabled"] = "true", ["Media:Ocr:Model"] = "vision-test", ["Media:Voice:Model"] = "speech-test" }).Build();
        return new(config, Options.Create(new AiOptions { Enabled = true }), new(db, current.Object), credentials.Object, clients.Object, new(TimeProvider.System));
    }
}
public partial class PurchaseIntentEndpointTests
{
    [Fact] public async Task MediaEndpointsRequirePurchasePermissionAndActiveMembership()
    {
        using var factory = new Factory { Permission = "stock.view" }; using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/ai/media/capabilities")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/ai/media/capabilities")).StatusCode);
        using (var permitted = factory.Services.CreateScope()) {
            var context = permitted.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await context.Memberships.SingleAsync(); membership.PermissionsJson = "[\"purchase.create\"]"; await context.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        var result = await client.GetAsync("/api/v1/ai/media/capabilities"); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Contains("\"ocr\":false", await result.Content.ReadAsStringAsync());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Memberships.RemoveRange(await db.Memberships.ToListAsync()); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/ai/media/capabilities")).StatusCode);
    }
    [Fact] public void MediaClientCannotRedirectCredentialsOrBufferUnlimitedData()
    {
        using var factory = new Factory(); using var client = factory.Services.GetRequiredService<IHttpClientFactory>().CreateClient("Media");
        Assert.Equal(128000, client.MaxResponseContentBufferSize); Assert.Equal(TimeSpan.FromSeconds(30), client.Timeout);
        var handler = factory.Services.GetRequiredService<IHttpMessageHandlerFactory>().CreateHandler("Media");
        while (handler is DelegatingHandler outer) handler = outer.InnerHandler!;
        Assert.False(Assert.IsType<HttpClientHandler>(handler).AllowAutoRedirect);
    }
}
