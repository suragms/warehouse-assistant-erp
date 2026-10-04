using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces.AI;
using System.Net.Http.Json;

namespace PurchaseAssistant.Infrastructure.Services.AI;

public class GeminiProvider : IAIProvider, IAIProviderReadiness
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;

    public GeminiProvider(HttpClient httpClient, string apiKey)
    {
        _httpClient = httpClient;
        _apiKey = apiKey;
    }

    public AIProviderType ProviderType => AIProviderType.Gemini;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<AIResponse> SendRequestAsync(AIRequest request, CancellationToken ct = default)
    {
        var startTime = DateTime.UtcNow;
        try
        {
            var payload = new
            {
                systemInstruction = new { parts = new[] { new { text = request.SystemPrompt ?? "Extract purchase intent as JSON." } } },
                contents = new[]
                {
                    new { parts = new[] { new { text = request.Prompt } } }
                }
            };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(request.ModelOverride ?? "gemini-1.5-flash")}:generateContent");
            httpRequest.Headers.Add("x-goog-api-key", _apiKey);
            httpRequest.Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(httpRequest, ct);
            if (!response.IsSuccessStatusCode) return ProviderErrors.Failure(response, ProviderType.ToString(), request.ModelOverride ?? "default", (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds);

            using var data = await System.Text.Json.JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            string? content = data.RootElement.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString();

            return new AIResponse(
                Success: !string.IsNullOrWhiteSpace(content),
                Content: content,
                Error: string.IsNullOrWhiteSpace(content) ? "AI_EMPTY_RESPONSE" : null,
                Provider: ProviderType.ToString(),
                ModelUsed: request.ModelOverride ?? "gemini-1.5-flash",
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
                ModelUsed: request.ModelOverride ?? "gemini-1.5-flash",
                LatencyMs: (decimal)(DateTime.UtcNow - startTime).TotalMilliseconds
            );
        }
    }
}
