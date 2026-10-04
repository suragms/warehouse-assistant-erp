using System.Net.Http.Json;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces.AI;

namespace PurchaseAssistant.Infrastructure.Services.AI;

public class OpenAIProvider : IAIProvider, IAIProviderReadiness
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;

    public OpenAIProvider(HttpClient httpClient, string apiKey)
    {
        _httpClient = httpClient;
        _apiKey = apiKey;
    }

    public AIProviderType ProviderType => AIProviderType.OpenAI;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<AIResponse> SendRequestAsync(AIRequest request, CancellationToken ct = default)
    {
        var startTime = DateTime.UtcNow;
        try
        {
            var payload = new
            {
                model = request.ModelOverride ?? "gpt-4o-mini",
                messages = new[]
                {
                    new { role = "system", content = request.SystemPrompt ?? "You are a helpful assistant." },
                    new { role = "user", content = request.Prompt }
                },
                temperature = 0
            };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
            httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _apiKey);
            httpRequest.Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(httpRequest, ct);
            if (!response.IsSuccessStatusCode) return ProviderErrors.Failure(response, ProviderType.ToString(), request.ModelOverride ?? "default", (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds);

            using var data = await System.Text.Json.JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            string? content = data.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();

            return new AIResponse(
                Success: !string.IsNullOrWhiteSpace(content),
                Content: content,
                Error: string.IsNullOrWhiteSpace(content) ? "AI_EMPTY_RESPONSE" : null,
                Provider: ProviderType.ToString(),
                ModelUsed: request.ModelOverride ?? "gpt-4o-mini",
                LatencyMs: (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds
            );
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (System.Net.Http.HttpRequestException ex)
        {
            return new AIResponse(false, null, ex.HttpRequestError == HttpRequestError.ConfigurationLimitExceeded ? "AI_RESPONSE_TOO_LARGE" : ProviderErrors.Normalize(ex.StatusCode), ProviderType.ToString(), request.ModelOverride ?? "default", (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds);
        }
        catch (Exception)
        {
            return new AIResponse(
                Success: false,
                Content: null,
                Error: "AI_RESPONSE_INVALID",
                Provider: ProviderType.ToString(),
                ModelUsed: request.ModelOverride ?? "gpt-4o-mini",
                LatencyMs: (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds
            );
        }
    }
}
