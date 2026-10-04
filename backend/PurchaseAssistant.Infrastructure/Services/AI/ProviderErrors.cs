using System.Net;

namespace PurchaseAssistant.Infrastructure.Services.AI;

public static class ProviderErrors
{
    public static PurchaseAssistant.Application.DTOs.AI.AIResponse Failure(HttpResponseMessage response, string provider, string model, decimal latency)
    {
        var delay = response.Headers.RetryAfter?.Delta ?? (response.Headers.RetryAfter?.Date - DateTimeOffset.UtcNow);
        var milliseconds = delay.HasValue ? (int?)Math.Clamp(delay.Value.TotalMilliseconds, 0, int.MaxValue) : null;
        return new(false, null, Normalize(response.StatusCode), provider, model, latency, RetryAfterMilliseconds: milliseconds);
    }
    // Upstream response bodies and credentials never become public errors.
    public static string Normalize(HttpStatusCode? status) => status switch {
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => "AI_AUTH_FAILED",
        HttpStatusCode.TooManyRequests => "AI_RATE_LIMITED",
        HttpStatusCode.RequestTimeout => "AI_PROVIDER_TIMEOUT",
        null => "AI_PROVIDER_UNAVAILABLE",
        _ when (int)status >= 500 => "AI_PROVIDER_UNAVAILABLE",
        _ => "AI_MODEL_OR_REQUEST_INVALID"
    };
    public static bool Retryable(string? error) => error is "AI_RATE_LIMITED" or "AI_PROVIDER_TIMEOUT" or "AI_PROVIDER_UNAVAILABLE" or "AI_PROVIDER_FAILED";
}
