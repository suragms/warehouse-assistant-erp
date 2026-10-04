using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.AI;

namespace PurchaseAssistant.UnitTests.AI;

public class Phase4ProviderTests
{
    private sealed class Handler(HttpStatusCode status, string response) : HttpMessageHandler {
        public Uri? Url; public string? Body;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
            Url = request.RequestUri; Body = await request.Content!.ReadAsStringAsync(ct);
            var result = new HttpResponseMessage(status) { Content = new StringContent(response, Encoding.UTF8, "application/json") };
            if (status == HttpStatusCode.TooManyRequests) result.Headers.RetryAfter = new(TimeSpan.FromSeconds(10));
            return result;
        }
    }
    public static IEnumerable<object[]> ProviderFailures => from provider in new[] { AIProviderType.OpenAI, AIProviderType.Groq, AIProviderType.OpenRouter, AIProviderType.Gemini }
        from status in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.BadRequest, HttpStatusCode.TooManyRequests, HttpStatusCode.ServiceUnavailable } select new object[] { provider, status };
    private static IAIProvider Create(AIProviderType type, HttpClient client) => type switch {
        AIProviderType.OpenAI => new OpenAIProvider(client, "test-secret"), AIProviderType.Groq => new GroqProvider(client, "test-secret"),
        AIProviderType.OpenRouter => new OpenRouterProvider(client, "test-secret"), _ => new GeminiProvider(client, "test-secret") };
    [Theory, MemberData(nameof(ProviderFailures))]
    public async Task EveryProviderNormalizesStatusWithoutReturningUpstreamSecrets(AIProviderType type, HttpStatusCode status)
    {
        var handler = new Handler(status, "upstream-sensitive-prompt-and-test-secret"); using var client = new HttpClient(handler);
        var result = await Create(type, client).SendRequestAsync(new("synthetic test prompt", ModelOverride: "account-approved-model"));
        Assert.False(result.Success); Assert.Null(result.Content); Assert.Equal(ProviderErrors.Normalize(status), result.Error);
        Assert.DoesNotContain("test-secret", JsonSerializer.Serialize(result)); Assert.DoesNotContain("test-secret", handler.Url!.AbsoluteUri);
        if (status == HttpStatusCode.TooManyRequests) Assert.Equal(10000, result.RetryAfterMilliseconds);
    }
    [Theory, InlineData(AIProviderType.OpenAI), InlineData(AIProviderType.Groq), InlineData(AIProviderType.OpenRouter), InlineData(AIProviderType.Gemini)]
    public async Task EveryProviderUsesTheConfiguredModel(AIProviderType type)
    {
        var response = type == AIProviderType.Gemini ? "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{}\"}]}}]}" : "{\"choices\":[{\"message\":{\"content\":\"{}\"}}]}";
        var handler = new Handler(HttpStatusCode.OK, response); using var client = new HttpClient(handler);
        var result = await Create(type, client).SendRequestAsync(new("synthetic text", ModelOverride: "account-approved-model")); Assert.True(result.Success); Assert.Equal("account-approved-model", result.ModelUsed);
        Assert.Contains("account-approved-model", type == AIProviderType.Gemini ? handler.Url!.AbsoluteUri : handler.Body);
    }
    [Theory, InlineData(AIProviderType.OpenAI), InlineData(AIProviderType.Groq), InlineData(AIProviderType.OpenRouter), InlineData(AIProviderType.Gemini)]
    public async Task OversizedProviderResponsesArePermanentFailures(AIProviderType type)
    {
        using var client = new HttpClient(new Handler(HttpStatusCode.OK, new string('x', 1_000_001))) { MaxResponseContentBufferSize = 1_000_000 };
        var result = await Create(type, client).SendRequestAsync(new("synthetic")); Assert.False(result.Success); Assert.Null(result.Content);
        Assert.Equal("AI_RESPONSE_TOO_LARGE", result.Error); Assert.False(ProviderErrors.Retryable(result.Error));
    }
    [Theory, InlineData("AI_AUTH_FAILED", null), InlineData("AI_MODEL_OR_REQUEST_INVALID", null), InlineData("AI_RATE_LIMITED", 10000), InlineData("AI_RESPONSE_INVALID", null)]
    public async Task PermanentErrorsAndLongBackoffDoNotRepeatTheProvider(string error, int? backoff)
    {
        var business = Guid.NewGuid(); await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Businesses.Add(new Business { Id = business, Name = "Synthetic provider fixture", AiSettingsJson = JsonSerializer.Serialize(new AiProviderPolicy { ProviderOrder = ["OpenAI"], Retries = 1 }) }); await db.SaveChangesAsync();
        var user = new Mock<ICurrentUserService>(); user.SetupGet(x => x.BusinessId).Returns(business);
        var provider = new Mock<IAIProvider>(); provider.Setup(x => x.SendRequestAsync(It.IsAny<AIRequest>(), It.IsAny<CancellationToken>())).ReturnsAsync(new AIResponse(false, null, error, "OpenAI", "fixture-model", 0, backoff));
        var factory = new Mock<IAIProviderFactory>(); factory.Setup(x => x.GetProviderAsync(AIProviderType.OpenAI, It.IsAny<CancellationToken>())).ReturnsAsync(provider.Object);
        var routing = new AIRoutingService(factory.Object, NullLogger<AIRoutingService>.Instance, Options.Create(new AiOptions()), settings: new(db, user.Object));
        Assert.False((await routing.ExecuteWithFailoverAsync(new("synthetic"))).Success); provider.Verify(x => x.SendRequestAsync(It.IsAny<AIRequest>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
