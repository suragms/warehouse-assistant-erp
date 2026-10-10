using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;
using PurchaseAssistant.Application.DTOs;

namespace PurchaseAssistant.Web.Authorization;

// Apply at the serialization boundary so nested dashboards and list responses receive the same protection.
public sealed class OwnerFinancialResultFilter : IAsyncResultFilter
{
    private static readonly HashSet<string> FinancialKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "unitPrice", "lineTotal", "subtotal", "taxTotal", "grandTotal", "price", "pricePerKg", "discountPercent", "taxPercent",
        "totalPurchaseSpend", "totalSpend", "estimatedInventoryValue", "currentPeriodSpend",
        "previousPeriodSpend", "spendChangePercentage", "currentPeriodAvgOrderValue",
        "previousPeriodAvgOrderValue", "avgOrderValueChangePercentage", "landingCost", "sellingPrice",
        "landingCostPerKg", "profit", "paidAmount", "remainingAmount"
    };

    public static void Redact(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(p => p.Key).ToList())
                if (FinancialKeys.Contains(key)) obj.Remove(key);
                else Redact(obj[key]);
        }
        else if (node is JsonArray array)
            foreach (var child in array) Redact(child);
    }

    public static JsonSerializerOptions NonOwnerOptions(JsonSerializerOptions source)
    {
        var options = new JsonSerializerOptions(source);
        var resolver = source.TypeInfoResolver ?? new DefaultJsonTypeInfoResolver();
        options.TypeInfoResolver = resolver.WithAddedModifier(type =>
        {
            foreach (var property in type.Properties)
            {
                var numeric = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
                var attributes = property.AttributeProvider;
                if (attributes?.IsDefined(typeof(FinancialFieldAttribute), true) == true
                    || (numeric == typeof(decimal) || numeric == typeof(double) || numeric == typeof(float))
                        && attributes?.IsDefined(typeof(OperationalNumericAttribute), true) != true)
                    property.ShouldSerialize = (_, _) => false;
            }
        });
        return options;
    }

    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        if (context.HttpContext.User.Identity?.IsAuthenticated == true
            && context.HttpContext.User.FindFirst("role")?.Value != "Owner"
            && context.HttpContext.User.FindFirst("role")?.Value != "Admin"
            && context.HttpContext.User.FindFirst("role")?.Value != "SuperAdmin"
            && context.Result is ObjectResult { Value: not null } result && (result.StatusCode ?? 200) < 400)
        {
            var options = context.HttpContext.RequestServices
                .GetRequiredService<Microsoft.Extensions.Options.IOptions<JsonOptions>>().Value.JsonSerializerOptions;
            var node = JsonSerializer.SerializeToNode(result.Value, result.Value.GetType(), NonOwnerOptions(options));
            Redact(node);
            result.Value = node;
            result.DeclaredType = typeof(JsonNode);
        }
        await next();
    }
}
