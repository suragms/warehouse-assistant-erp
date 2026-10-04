using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Application.Interfaces.AI;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;

namespace PurchaseAssistant.Web.Services;
public record DeliveryRequest(Guid RequestId, uint PurchaseVersion, Guid? DeliveryVersion, string Recipient, bool Confirmed, bool VerifiedNotDelivered = false);
public class WhatsAppDeliveryService(AppDbContext db, ICurrentUserService user, IProviderCredentialResolver credentials, IConfiguration config, IHttpClientFactory clients)
{
    private Guid Business => user.BusinessId ?? throw new UnauthorizedAccessException();
    private void Authorize() { if (user.Role is not ("Owner" or "SuperAdmin")) throw new UnauthorizedAccessException(); }
    private async Task<PurchaseOrder> Order(Guid id, CancellationToken ct) => await db.Purchases.AsNoTracking().Include(x => x.Items).ThenInclude(x => x.CatalogItem)
        .SingleOrDefaultAsync(x => x.BusinessId == Business && x.Id == id, ct) ?? throw new KeyNotFoundException();
    private async Task<(string? Key, string? Phone, string? Recipient, string? Version, bool Ready)> Settings(CancellationToken ct)
    {
        var key = await credentials.ResolveAsync("whatsapp_api_key", ct);
        var phone = await credentials.ResolveAsync("whatsapp_phone_number_id", ct);
        var recipient = (await credentials.ResolveAsync("whatsapp_staff_number", ct))?.Trim().TrimStart('+');
        var version = config["WhatsApp:GraphVersion"];
        var ready = config.GetValue<bool>("WhatsApp:Enabled") && !string.IsNullOrWhiteSpace(key)
            && Regex.IsMatch(phone ?? "", @"^\d{5,30}$") && Regex.IsMatch(recipient ?? "", @"^\d{7,15}$") && Regex.IsMatch(version ?? "", @"^v\d{1,3}\.0$");
        return (key, phone, recipient, version, ready);
    }
    public async Task<object> Preview(Guid id, CancellationToken ct)
    {
        Authorize(); var order = await Order(id, ct); var settings = await Settings(ct);
        var delivery = await db.Set<PurchaseDelivery>().AsNoTracking().SingleOrDefaultAsync(x => x.BusinessId == Business && x.PurchaseId == id, ct);
        return new { ready = settings.Ready, recipient = settings.Recipient, purchaseVersion = order.Version, eligible = order.Status is not (PurchaseStatus.Draft or PurchaseStatus.Cancelled), requiresVerification = RequiresVerification(delivery), delivery };
    }
    public async Task<PurchaseDelivery> Send(Guid id, DeliveryRequest request, CancellationToken ct)
    {
        Authorize(); var order = await Order(id, ct);
        if (!request.Confirmed || request.RequestId == Guid.Empty || order.Version != request.PurchaseVersion || order.Status is PurchaseStatus.Draft or PurchaseStatus.Cancelled)
            throw new ArgumentException("Review and confirm a current, confirmed purchase before sending.");
        var settings = await Settings(ct);
        if (!settings.Ready) throw new InvalidOperationException("WhatsApp is not configured on this host or business.");
        if (request.Recipient != settings.Recipient) throw new InvalidOperationException("Recipient changed. Reload the delivery preview.");
        var row = await db.Set<PurchaseDelivery>().SingleOrDefaultAsync(x => x.BusinessId == Business && x.PurchaseId == id, ct);
        if (row?.RequestId == request.RequestId || row?.Status == "accepted") return row;
        if (row != null && (row.Version != request.DeliveryVersion || (row.Status == "sending" && !RequiresVerification(row)) || (RequiresVerification(row) && !request.VerifiedNotDelivered)))
            throw new InvalidOperationException("Delivery is in progress, changed, or has an unknown outcome. Verify its status with Meta before retrying.");
        // Quantity-only PDF: the configured staff recipient is never sent owner financial data.
        var bytes = ExportFileBuilder.Pdf(order.OrderNumber, order.Items.Select(x => $"{x.CatalogItem.Name} | {x.OrderedQuantity:0.####} {x.Unit}"));
        if (row == null) { row = new PurchaseDelivery { BusinessId = Business, PurchaseId = id }; db.Add(row); }
        row.RequestId = request.RequestId; row.Version = Guid.NewGuid(); row.Status = "sending"; row.ErrorCode = null; row.Attempts++;
        row.RecipientLastFour = settings.Recipient![^4..]; row.UpdatedAt = DateTime.UtcNow;
        Audit(row, "WhatsAppDeliveryRequested");
        await db.SaveChangesAsync(ct); // Unique purchase key + version prevents concurrent sends.
        var messageAttempted = false;
        try {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(45));
            using var client = clients.CreateClient("WhatsApp");
            using var content = new MultipartFormDataContent();
            content.Add(new StringContent("whatsapp"), "messaging_product"); content.Add(new StringContent("application/pdf"), "type");
            var file = new ByteArrayContent(bytes); file.Headers.ContentType = new("application/pdf"); content.Add(file, "file", "purchase.pdf");
            using var upload = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{settings.Version}/{settings.Phone}/media") { Content = content };
            upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.Key);
            using var uploaded = await client.SendAsync(upload, timeout.Token);
            uploaded.EnsureSuccessStatusCode(); await uploaded.Content.LoadIntoBufferAsync(65536, timeout.Token);
            using var media = JsonDocument.Parse(await uploaded.Content.ReadAsStringAsync(timeout.Token));
            var mediaId = media.RootElement.GetProperty("id").GetString();
            if (string.IsNullOrWhiteSpace(mediaId) || mediaId.Length > 255) throw new InvalidDataException();
            using var send = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{settings.Version}/{settings.Phone}/messages") {
                Content = JsonContent.Create(new { messaging_product = "whatsapp", to = settings.Recipient, type = "document", document = new { id = mediaId, filename = "purchase.pdf" } }) };
            send.Headers.Authorization = new("Bearer", settings.Key); messageAttempted = true;
            using var response = await client.SendAsync(send, timeout.Token);
            if ((int)response.StatusCode is >= 400 and < 500) { row.Status = "failed"; row.ErrorCode = "PROVIDER_REJECTED"; }
            else {
                response.EnsureSuccessStatusCode(); await response.Content.LoadIntoBufferAsync(65536, timeout.Token);
                using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
                var messageId = body.RootElement.GetProperty("messages")[0].GetProperty("id").GetString();
                if (string.IsNullOrWhiteSpace(messageId) || messageId.Length > 255) throw new InvalidDataException();
                row.MessageId = messageId; row.Status = "accepted";
            }
        } catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or JsonException or InvalidDataException or KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException) {
            row.Status = messageAttempted ? "unknown" : "failed"; row.ErrorCode = messageAttempted ? "DELIVERY_OUTCOME_UNKNOWN" : "MEDIA_UPLOAD_FAILED";
        }
        row.UpdatedAt = DateTime.UtcNow; row.Version = Guid.NewGuid(); Audit(row, "WhatsAppDeliveryResult");
        using var persist = new CancellationTokenSource(TimeSpan.FromSeconds(10)); await db.SaveChangesAsync(persist.Token);
        return row;
    }
    // A crashed worker cannot finalize its row. After more than twice the transport timeout,
    // require an operator to verify the provider outcome before any explicit retry.
    private static bool RequiresVerification(PurchaseDelivery? row) => row?.Status == "unknown"
        || (row?.Status == "sending" && row.UpdatedAt < DateTime.UtcNow.AddMinutes(-2));
    private void Audit(PurchaseDelivery row, string action) => db.SecurityAuditLogs.Add(new() { BusinessId = Business, UserId = user.UserId, EventType = action,
        Description = "Purchase delivery status recorded.", MetadataJson = JsonSerializer.Serialize(new { row.PurchaseId, row.Status, row.RequestId, row.Attempts, row.ErrorCode }) });
}
