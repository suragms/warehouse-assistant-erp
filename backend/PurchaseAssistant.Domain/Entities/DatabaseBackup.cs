namespace PurchaseAssistant.Domain.Entities;

// Platform-wide recovery metadata. Never expose through tenant APIs or tenant report queries.
public class DatabaseBackupSettings
{
    public int Id { get; set; } = 1;
    public bool DailyEnabled { get; set; }
    public int DailyHour { get; set; } = 2;
    public int DailyMinute { get; set; }
    public bool MonthlyEnabled { get; set; }
    public int MonthlyDay { get; set; } = 1;
    public int MonthlyHour { get; set; } = 3;
    public int MonthlyMinute { get; set; }
    public string TimeZone { get; set; } = "Asia/Kolkata";
    public int DailyRetention { get; set; } = 14;
    public int MonthlyRetention { get; set; } = 12;
    public int ManualRetention { get; set; } = 10;
    public Guid Revision { get; set; } = Guid.NewGuid();
}
public class DatabaseBackupJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = "manual";
    public string Status { get; set; } = "queued";
    public string Stage { get; set; } = "Waiting for worker";
    public string? ScheduleKey { get; set; }
    public Guid? SourceId { get; set; }
    public Guid? ActorId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? LeaseUntil { get; set; }
    public DateTime? RetryAt { get; set; }
    public int Attempts { get; set; }
    public long? SizeBytes { get; set; }
    public string? Sha256 { get; set; }
    public string? ErrorCode { get; set; }
    public bool Pinned { get; set; }
    public bool OffsiteVerified { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public Guid Revision { get; set; } = Guid.NewGuid();
}
public class DatabaseBackupEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? JobId { get; set; }
    public Guid? ActorId { get; set; }
    public string Action { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
