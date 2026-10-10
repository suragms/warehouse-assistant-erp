using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PurchaseAssistant.Domain.Entities;
namespace PurchaseAssistant.Infrastructure.Data.Configurations;
public class DatabaseBackupSettingsConfiguration : IEntityTypeConfiguration<DatabaseBackupSettings>
{
    public void Configure(EntityTypeBuilder<DatabaseBackupSettings> e)
    {
        e.HasKey(x => x.Id); e.Property(x => x.Id).ValueGeneratedNever();
        e.Property(x => x.TimeZone).HasMaxLength(100); e.Property(x => x.Revision).IsConcurrencyToken();
        e.ToTable(t => t.HasCheckConstraint("CK_DatabaseBackupSettings_Valid", "\"Id\" = 1 AND \"DailyHour\" BETWEEN 0 AND 23 AND \"DailyMinute\" BETWEEN 0 AND 59 AND \"MonthlyDay\" BETWEEN 1 AND 31 AND \"MonthlyHour\" BETWEEN 0 AND 23 AND \"MonthlyMinute\" BETWEEN 0 AND 59 AND \"DailyRetention\" BETWEEN 1 AND 365 AND \"MonthlyRetention\" BETWEEN 1 AND 120 AND \"ManualRetention\" BETWEEN 1 AND 365"));
    }
}
public class DatabaseBackupJobConfiguration : IEntityTypeConfiguration<DatabaseBackupJob>
{
    public void Configure(EntityTypeBuilder<DatabaseBackupJob> e)
    {
        e.HasKey(x => x.Id); e.Property(x => x.Kind).HasMaxLength(16); e.Property(x => x.Status).HasMaxLength(16);
        e.Property(x => x.Stage).HasMaxLength(100); e.Property(x => x.ScheduleKey).HasMaxLength(48);
        e.Property(x => x.ErrorCode).HasMaxLength(64); e.Property(x => x.Sha256).HasMaxLength(64);
        e.Property(x => x.Revision).IsConcurrencyToken();
        e.HasIndex(x => x.ScheduleKey).IsUnique().HasFilter("\"ScheduleKey\" IS NOT NULL");
        e.HasIndex(x => new { x.Status, x.CreatedAt });
    }
}
public class DatabaseBackupEventConfiguration : IEntityTypeConfiguration<DatabaseBackupEvent>
{
    public void Configure(EntityTypeBuilder<DatabaseBackupEvent> e)
    { e.HasKey(x => x.Id); e.Property(x => x.Action).HasMaxLength(64); e.HasIndex(x => x.CreatedAt); }
}
