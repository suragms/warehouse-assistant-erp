namespace PurchaseAssistant.Domain.Entities;

// Global account recovery, deliberately independent of the caller's warehouse context.
public class PasswordRecovery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Email { get; set; } = "";
    public string TokenDigest { get; set; } = "";
    public string PasswordDigest { get; set; } = "";
    public string ProtectedToken { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? ClaimedAt { get; set; }
    public DateTime? ConsumedAt { get; set; }
    public string DeliveryStatus { get; set; } = "pending";
}
