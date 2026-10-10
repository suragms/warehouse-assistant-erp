using PurchaseAssistant.Domain.Entities;
namespace PurchaseAssistant.Infrastructure.Services.Backups;
public static class BackupSchedule
{
    public static DateTimeOffset Occurrence(DateTime date, int hour, int minute, string zone)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(zone);
        var local = DateTime.SpecifyKind(date.Date.AddHours(hour).AddMinutes(minute), DateTimeKind.Unspecified);
        // A skipped DST time runs at the first valid minute. Repeated times run once at the earlier occurrence.
        while (tz.IsInvalidTime(local)) local = local.AddMinutes(1);
        if (tz.IsAmbiguousTime(local)) return new DateTimeOffset(local, tz.GetAmbiguousTimeOffsets(local).Max()).ToUniversalTime();
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, tz));
    }
    public static (string Key, DateTimeOffset Due)? Due(DatabaseBackupSettings s, string kind, DateTimeOffset now)
    {
        var date = TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(s.TimeZone)).Date;
        if (kind == "daily" && s.DailyEnabled)
            return ($"daily:{date:yyyy-MM-dd}", Occurrence(date, s.DailyHour, s.DailyMinute, s.TimeZone));
        if (kind == "monthly" && s.MonthlyEnabled)
        {
            var day = Math.Min(s.MonthlyDay, DateTime.DaysInMonth(date.Year, date.Month));
            return ($"monthly:{date:yyyy-MM}", Occurrence(new DateTime(date.Year, date.Month, day), s.MonthlyHour, s.MonthlyMinute, s.TimeZone));
        }
        return null;
    }
    public static DateTimeOffset? Next(DatabaseBackupSettings s, string kind, DateTimeOffset now)
    {
        var due = Due(s, kind, now); if (due == null) return null;
        if (due.Value.Due > now) return due.Value.Due;
        var date = TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(s.TimeZone)).Date;
        if (kind == "daily") return Occurrence(date.AddDays(1), s.DailyHour, s.DailyMinute, s.TimeZone);
        var month = date.AddMonths(1);
        return Occurrence(new DateTime(month.Year, month.Month, Math.Min(s.MonthlyDay, DateTime.DaysInMonth(month.Year, month.Month))), s.MonthlyHour, s.MonthlyMinute, s.TimeZone);
    }
    public static void Validate(DatabaseBackupSettings s)
    {
        if (s.Id != 1 || s.DailyHour is < 0 or > 23 || s.DailyMinute is < 0 or > 59 || s.MonthlyHour is < 0 or > 23 || s.MonthlyMinute is < 0 or > 59 || s.MonthlyDay is < 1 or > 31 || s.DailyRetention is < 1 or > 365 || s.MonthlyRetention is < 1 or > 120 || s.ManualRetention is < 1 or > 365)
            throw new ArgumentException("Invalid schedule or retention.");
        try { TimeZoneInfo.FindSystemTimeZoneById(s.TimeZone); } catch { throw new ArgumentException("Unknown time zone."); }
    }
}
