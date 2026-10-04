using PurchaseAssistant.Application.DTOs;
using System.Text.Json.Serialization;

namespace PurchaseAssistant.Application.DTOs.AI;

public record AIRequest(
    string Prompt,
    string? SystemPrompt = null,
    string? ModelOverride = null
);

public record AIResponse(
    bool Success,
    string? Content,
    string? Error,
    string Provider,
    string ModelUsed,
    [property: OperationalNumeric] decimal LatencyMs,
    int? RetryAfterMilliseconds = null
);

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AIProviderType
{
    OpenRouter,
    Gemini,
    Groq,
    OpenAI,
    Stub
}
