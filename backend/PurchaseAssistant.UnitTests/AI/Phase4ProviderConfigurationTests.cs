using Microsoft.Extensions.DependencyInjection;

namespace PurchaseAssistant.UnitTests.AI;

public partial class PurchaseIntentEndpointTests
{
    [Theory, InlineData("OpenAIProvider"), InlineData("GeminiProvider"), InlineData("GroqProvider"), InlineData("OpenRouterProvider")]
    public void ConfiguredProviderClientsBoundResponsesAndNeverFollowCredentialRedirects(string name)
    {
        using var factory = new Factory(); var clients = factory.Services.GetRequiredService<IHttpClientFactory>(); using var client = clients.CreateClient(name);
        Assert.Equal(1_000_000, client.MaxResponseContentBufferSize); Assert.Equal(TimeSpan.FromSeconds(20), client.Timeout);
        var handler = factory.Services.GetRequiredService<IHttpMessageHandlerFactory>().CreateHandler(name);
        while (handler is DelegatingHandler outer) handler = outer.InnerHandler!;
        Assert.False(Assert.IsType<HttpClientHandler>(handler).AllowAutoRedirect);
    }
}
