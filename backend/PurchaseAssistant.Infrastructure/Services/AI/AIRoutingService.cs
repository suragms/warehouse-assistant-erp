using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PurchaseAssistant.Application.DTOs.AI;
using PurchaseAssistant.Application.Interfaces.AI;

namespace PurchaseAssistant.Infrastructure.Services.AI;

public class AIRoutingService : IAIRoutingService
{
    private readonly IAIProviderFactory _providerFactory;
    private readonly ILogger<AIRoutingService> _logger;
    private readonly AiOptions _aiOptions;
    private readonly IAIUsageRecorder? _usage;
    private readonly AiRuntimeSettings? _settings;
    private readonly AiCircuitBreaker? _circuit;

    // Define priority order
    private readonly AIProviderType[] _failoverOrder =
    {
        AIProviderType.OpenRouter,
        AIProviderType.Gemini,
        AIProviderType.Groq,
        AIProviderType.OpenAI,
        AIProviderType.Stub
    };

    public AIRoutingService(IAIProviderFactory providerFactory, ILogger<AIRoutingService> logger, IOptions<AiOptions> aiOptions, IAIUsageRecorder? usage = null, AiRuntimeSettings? settings = null, AiCircuitBreaker? circuit = null)
    {
        _providerFactory = providerFactory;
        _logger = logger;
        _aiOptions = aiOptions.Value;
        _usage = usage;
        _settings = settings; _circuit = circuit;
    }

    public async Task<AIResponse> ExecuteWithFailoverAsync(AIRequest request, CancellationToken ct = default)
    {
        if (!_aiOptions.Enabled)
        {
            return new AIResponse(false, null, "AI_DISABLED", "None", "None", 0);
        }

        var attempts = 0; var watch = System.Diagnostics.Stopwatch.StartNew();
        var policy = _settings == null ? new AiProviderPolicy() : await _settings.GetAsync(ct);
        if (!policy.Enabled) return new AIResponse(false, null, "AI_DISABLED", "None", "None", 0);
        async Task<AIResponse> Record(AIResponse result) {
            if (_usage != null) try { await _usage.RecordAsync(result with { LatencyMs = watch.ElapsedMilliseconds }, attempts > 1, ct); }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (Exception) { _logger.LogWarning("AI usage metadata could not be recorded"); }
            return result;
        }
        var order = _settings == null ? _failoverOrder : policy.ProviderOrder.Select(x => Enum.Parse<AIProviderType>(x)).ToArray();
        foreach (var providerType in order)
        {
            ct.ThrowIfCancellationRequested();
            var circuitKey = $"{_settings?.BusinessId}:{policy.Version}:{providerType}";
            if (_circuit?.IsOpen(circuitKey) == true) continue;
            try
            {
                var provider = await _providerFactory.GetProviderAsync(providerType, ct);
                if (provider is IAIProviderReadiness { IsConfigured: false })
                {
                    _logger.LogInformation("Provider {Provider} is missing required credentials; skipping.", providerType);
                    continue;
                }
                AIResponse response = new(false, null, "AI_PROVIDER_FAILED", providerType.ToString(), "", 0);
                for (var attempt = 0; attempt <= policy.Retries; attempt++) {
                    attempts++;
                    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct); deadline.CancelAfter(TimeSpan.FromSeconds(policy.TimeoutSeconds));
                    var configuredRequest = policy.Models.TryGetValue(providerType.ToString(), out var model) ? request with { ModelOverride = model } : request;
                    try { response = await provider.SendRequestAsync(configuredRequest, deadline.Token); }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested) { response = response with { Error = "AI_PROVIDER_TIMEOUT" }; }
                    if (response.Success) break;
                    if (!ProviderErrors.Retryable(response.Error)) break;
                    // A long upstream backoff is not shortened: defer this provider and use the bounded fallback path.
                    if (response.RetryAfterMilliseconds > 2000) break;
                    if (attempt < policy.Retries) await Task.Delay(TimeSpan.FromMilliseconds(Math.Min(2000, Math.Max(200, response.RetryAfterMilliseconds ?? 0) + Random.Shared.Next(0, 101))), ct);
                }
                if (response.Success)
                {
                    _circuit?.Success(circuitKey);
                    _logger.LogInformation("AI Request succeeded using {Provider}", providerType);
                    return await Record(response);
                }

                _logger.LogWarning("AI Request failed using {Provider}", providerType);
                _circuit?.Failure(circuitKey);
            }
            catch (NotSupportedException)
            {
                _logger.LogInformation("Provider {Provider} not configured, skipping.", providerType);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception)
            {
                _circuit?.Failure(circuitKey);
                _logger.LogWarning("Provider {Provider} unavailable", providerType);
            }
        }

        return await Record(new AIResponse(
            Success: false,
            Content: null,
            Error: "All AI providers failed",
            Provider: "None",
            ModelUsed: "None",
            LatencyMs: 0
        ));
    }
}
