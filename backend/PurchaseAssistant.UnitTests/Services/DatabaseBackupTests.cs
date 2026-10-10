using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.Backups;
using System.Security.Cryptography;
namespace PurchaseAssistant.UnitTests.Services;

public class DatabaseBackupTests : IDisposable
{
    private readonly DbContextOptions<AppDbContext> options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
    private readonly IConfiguration config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Backup:LockNamespace"] = Guid.NewGuid().ToString() }).Build();
    private readonly Mock<IDatabaseBackupEngine> engine = new();
    private readonly AppDbContext db;
    private readonly Clock clock = new();
    private readonly Guid actor = Guid.NewGuid();
    private DatabaseBackupService Service(AppDbContext context) => new(context, engine.Object, config, clock);
    public DatabaseBackupTests()
    {
        db = new(options);
        engine.Setup(e => e.Open(It.IsAny<Guid>())).Returns(() => new MemoryStream("encrypted"u8.ToArray()));
        engine.Setup(e => e.Health()).Returns(new BackupHealth(true, "Protected storage", "persistent", false, []));
        engine.Setup(e => e.CreateAsync(It.IsAny<Guid>(), It.IsAny<Func<string, Task>>(), It.IsAny<CancellationToken>())).ReturnsAsync(new BackupArtifact(123, Convert.ToHexString(SHA256.HashData("encrypted"u8)), false));
        engine.Setup(e => e.VerifyAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(new BackupManifest(1, Guid.Empty, DateTime.UtcNow, "fingerprint", "17", [], [], "digest"));
    }
    public void Dispose() => db.Dispose();
    private class Clock : TimeProvider
    { public DateTimeOffset Now = DateTimeOffset.Parse("2026-10-10T12:00:00Z"); public override DateTimeOffset GetUtcNow() => Now; }
    [Theory]
    [InlineData(2026, 2, 28)] [InlineData(2028, 2, 29)] [InlineData(2026, 4, 30)] [InlineData(2026, 10, 31)]
    public void MonthlyClampsToMonthEnd(int year, int month, int day)
    {
        var s = new DatabaseBackupSettings { MonthlyEnabled = true, MonthlyDay = 31, TimeZone = "UTC", MonthlyHour = 0 };
        var now = new DateTimeOffset(year, month, 1, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.Zero), BackupSchedule.Due(s, "monthly", now)!.Value.Due);
    }
    [Fact]
    public void DstSkippedAndRepeatedTimesHaveOneDeterministicOccurrence()
    {
        Assert.Equal(DateTimeOffset.Parse("2026-03-08T07:00:00Z"), BackupSchedule.Occurrence(new(2026, 3, 8), 2, 30, "America/New_York"));
        Assert.Equal(DateTimeOffset.Parse("2026-11-01T05:30:00Z"), BackupSchedule.Occurrence(new(2026, 11, 1), 1, 30, "America/New_York"));
    }
    [Fact]
    public void SchedulesAreIndependentAndNextIsFuture()
    {
        var s = new DatabaseBackupSettings { DailyEnabled = true, MonthlyEnabled = false, TimeZone = "UTC" };
        Assert.Null(BackupSchedule.Next(s, "monthly", clock.Now)); Assert.Equal(clock.Now.Date.AddDays(1).AddHours(2), BackupSchedule.Next(s, "daily", clock.Now)!.Value.UtcDateTime);
        s.DailyEnabled = false; s.MonthlyEnabled = true; Assert.Null(BackupSchedule.Next(s, "daily", clock.Now)); Assert.NotNull(BackupSchedule.Next(s, "monthly", clock.Now));
    }
    [Fact]
    public async Task ManualRequestIsAsynchronousDeduplicatedAndAudited()
    {
        var job = await Service(db).Enqueue(actor, null, default); Assert.Equal("queued", job.Status);
        await Assert.ThrowsAsync<BackupBusyException>(() => Service(db).Enqueue(actor, null, default));
        engine.Verify(e => e.CreateAsync(It.IsAny<Guid>(), It.IsAny<Func<string, Task>>(), It.IsAny<CancellationToken>()), Times.Never);
        await Service(db).Tick(default); Assert.Equal("succeeded", job.Status); Assert.NotNull(job.Sha256);
        Assert.Contains(db.DatabaseBackupEvents, e => e.ActorId == actor && e.Action == "manual_requested"); Assert.Contains(db.DatabaseBackupEvents, e => e.Action == "succeeded");
    }
    [Fact]
    public async Task SchedulerDeduplicatesAcrossNewServiceInstancesAndRestart()
    {
        db.DatabaseBackupSettings.Add(new() { DailyEnabled = true, MonthlyEnabled = true, TimeZone = "UTC" }); await db.SaveChangesAsync();
        await Service(db).Tick(default); await using var next = new AppDbContext(options); await Service(next).Tick(default); await Service(next).Tick(default);
        Assert.Equal(2, await next.DatabaseBackupJobs.CountAsync()); Assert.All(await next.DatabaseBackupJobs.ToListAsync(), j => Assert.Equal("succeeded", j.Status));
    }
    [Fact]
    public async Task DisabledSchedulesAndUnconfirmedStorageDoNotQueueAutomaticJobs()
    {
        await Service(db).Tick(default); Assert.Empty(db.DatabaseBackupJobs);
        db.DatabaseBackupSettings.Add(new() { DailyEnabled = true }); await db.SaveChangesAsync();
        engine.Setup(e => e.Health()).Returns(new BackupHealth(true, "storage", "unknown", false, [])); await Service(db).Tick(default); Assert.Empty(db.DatabaseBackupJobs);
        await Assert.ThrowsAsync<ArgumentException>(() => Service(db).SaveSettings(new() { DailyEnabled = true }, actor, default));
    }
    [Fact]
    public async Task RetryIsBoundedAndNeverCreatesAnotherScheduleRecord()
    {
        db.DatabaseBackupSettings.Add(new() { DailyEnabled = true, TimeZone = "UTC" }); await db.SaveChangesAsync();
        engine.Setup(e => e.CreateAsync(It.IsAny<Guid>(), It.IsAny<Func<string, Task>>(), It.IsAny<CancellationToken>())).ThrowsAsync(new BackupFailure("dump_failed"));
        for (var i = 0; i < 5; i++) { await Service(db).Tick(default); clock.Now = clock.Now.AddHours(1); }
        var job = await db.DatabaseBackupJobs.SingleAsync(); Assert.Equal(3, job.Attempts); Assert.Equal("failed", job.Status); Assert.Equal("dump_failed", job.ErrorCode);
    }
    [Fact]
    public async Task ExpiredLeaseRecoversButLiveLeaseDoesNotRunASecondJob()
    {
        var job = new DatabaseBackupJob { Status = "running", Kind = "daily", ScheduleKey = "daily:2026-10-09", Attempts = 1, CreatedAt = clock.Now.UtcDateTime, LeaseUntil = clock.Now.AddHours(1).UtcDateTime };
        db.Add(job); db.DatabaseBackupSettings.Add(new() { DailyEnabled = true, DailyHour = 23, TimeZone = "UTC" }); await db.SaveChangesAsync(); await Service(db).Tick(default); Assert.Equal("running", job.Status);
        clock.Now = clock.Now.AddHours(2); await Service(db).Tick(default); Assert.Equal("succeeded", job.Status); Assert.Equal(2, job.Attempts);
    }
    [Fact]
    public async Task CancellationPersistsInterruptedStateAndKeepsExistingArchive()
    {
        var job = await Service(db).Enqueue(actor, null, default); using var cancellation = new CancellationTokenSource();
        engine.Setup(e => e.CreateAsync(It.IsAny<Guid>(), It.IsAny<Func<string, Task>>(), It.IsAny<CancellationToken>())).Returns(async () => { cancellation.Cancel(); await Task.Yield(); throw new OperationCanceledException(); });
        await Service(db).Tick(cancellation.Token); Assert.Equal("interrupted", job.Status); Assert.Equal("worker_interrupted", job.ErrorCode); engine.Verify(e => e.Delete(It.IsAny<Guid>()), Times.Never);
    }
    private DatabaseBackupJob Archive(int age, bool pinned = false) => new() { Status = "succeeded", CreatedAt = clock.Now.AddDays(-age).UtcDateTime, CompletedAt = clock.Now.AddDays(-age).UtcDateTime, VerifiedAt = clock.Now.AddDays(-age).UtcDateTime, Sha256 = Convert.ToHexString(SHA256.HashData("encrypted"u8)), Pinned = pinned };
    [Fact]
    public async Task RetentionPreservesPinnedAndLastGoodArchiveAndAuditsRemoval()
    {
        db.DatabaseBackupSettings.Add(new() { ManualRetention = 1 }); var old = Archive(3); var pinned = Archive(2, true); var good = Archive(1); db.AddRange(old, pinned, good); await db.SaveChangesAsync();
        await Service(db).Prune(default); Assert.Equal("deleted", old.Status); Assert.Equal("succeeded", pinned.Status); Assert.Equal("succeeded", good.Status);
        engine.Verify(e => e.Delete(old.Id), Times.Once); Assert.Contains(db.DatabaseBackupEvents, e => e.JobId == old.Id && e.Action == "retention_deleted");
        await Assert.ThrowsAsync<ArgumentException>(() => Service(db).Delete(good.Id, actor, default)); await Assert.ThrowsAsync<ArgumentException>(() => Service(db).Delete(pinned.Id, actor, default));
    }
    [Fact]
    public async Task SeparateVerificationAndConfirmedRecoveryPinWithoutBusinessWrites()
    {
        var archive = Archive(1); db.Add(archive); await db.SaveChangesAsync(); var verify = await Service(db).Enqueue(actor, archive.Id, default); await Service(db).Tick(default);
        Assert.Equal("succeeded", verify.Status); await Assert.ThrowsAsync<ArgumentException>(() => Service(db).RecoveryPreflight(archive.Id, actor, false, default));
        await Service(db).RecoveryPreflight(archive.Id, actor, true, default); Assert.True(archive.Pinned);
        Assert.Empty(db.StockMovements); Assert.Empty(db.Purchases); Assert.Contains(db.DatabaseBackupEvents, e => e.Action == "recovery_preflight_confirmed");
    }
    [Theory]
    [InlineData(-1, 0, 1, "UTC")] [InlineData(24, 0, 1, "UTC")] [InlineData(2, 60, 1, "UTC")] [InlineData(2, 0, 0, "UTC")] [InlineData(2, 0, 32, "UTC")] [InlineData(2, 0, 1, "INVALID")]
    public void InvalidSchedulesRejected(int hour, int minute, int day, string zone) => Assert.Throws<ArgumentException>(() => BackupSchedule.Validate(new() { DailyHour = hour, DailyMinute = minute, MonthlyDay = day, TimeZone = zone }));
    [Fact]
    public async Task EncryptionRoundTripMultipleChunksAndEmptyInput()
    {
        foreach (var length in new[] { 0, 7, 2_100_000 })
        {
            var data = RandomNumberGenerator.GetBytes(length); var key = RandomNumberGenerator.GetBytes(32);
            using var cipher = new MemoryStream(); await BackupEncryption.EncryptAsync(new MemoryStream(data), cipher, "test", key, default);
            Assert.DoesNotContain("SECRET", System.Text.Encoding.ASCII.GetString(cipher.ToArray())); cipher.Position = 0; using var restored = new MemoryStream();
            await BackupEncryption.DecryptAsync(cipher, restored, _ => key.ToArray(), default); Assert.Equal(data, restored.ToArray());
        }
    }
    [Theory]
    [InlineData("tamper")] [InlineData("truncate")] [InlineData("suffix")] [InlineData("wrong_key")]
    public async Task EncryptionRejectsTamperTruncationSuffixAndWrongKeys(string attack)
    {
        var key = RandomNumberGenerator.GetBytes(32); using var cipher = new MemoryStream(); await BackupEncryption.EncryptAsync(new MemoryStream("SECRET DATA"u8.ToArray()), cipher, "test", key, default);
        var bytes = cipher.ToArray(); if (attack == "tamper") bytes[40] ^= 1; if (attack == "truncate") bytes = bytes[..^1]; if (attack == "suffix") bytes = bytes.Concat(new byte[] { 1 }).ToArray();
        await Assert.ThrowsAnyAsync<Exception>(() => BackupEncryption.DecryptAsync(new MemoryStream(bytes), new MemoryStream(), _ => attack == "wrong_key" ? RandomNumberGenerator.GetBytes(32) : key.ToArray(), default));
    }

    [Fact]
    public async Task DisablingScheduleCancelsPendingRetriesButKeepsRunningAndManualJobs()
    {
        var s = new DatabaseBackupSettings { DailyEnabled = true, MonthlyEnabled = true }; var queued = new DatabaseBackupJob { Kind = "daily", ScheduleKey = "daily:old", CreatedAt = clock.Now.UtcDateTime }; var running = new DatabaseBackupJob { Kind = "daily", ScheduleKey = "daily:running", Status = "running", CreatedAt = clock.Now.UtcDateTime }; var manual = new DatabaseBackupJob { CreatedAt = clock.Now.UtcDateTime };
        db.AddRange(s, queued, running, manual); await db.SaveChangesAsync();
        await Service(db).SaveSettings(new() { DailyEnabled = false, MonthlyEnabled = true, Revision = s.Revision }, actor, default);
        Assert.Equal("cancelled", queued.Status); Assert.Equal("running", running.Status); Assert.Equal("queued", manual.Status); Assert.True(s.MonthlyEnabled);
    }
    [Fact]
    public async Task MissingOrCorruptedNewerFileNeverAllowsLastActualGoodFileToBeRemoved()
    {
        var old = Archive(2); var newer = Archive(1); db.AddRange(old, newer); await db.SaveChangesAsync();
        engine.Setup(e => e.Open(newer.Id)).Throws(new KeyNotFoundException()); await Assert.ThrowsAsync<ArgumentException>(() => Service(db).Delete(old.Id, actor, default));
        engine.Setup(e => e.Open(newer.Id)).Returns(() => new MemoryStream("corrupted"u8.ToArray())); await Assert.ThrowsAsync<ArgumentException>(() => Service(db).Delete(old.Id, actor, default));
        Assert.Equal("succeeded", old.Status); engine.Verify(e => e.Delete(It.IsAny<Guid>()), Times.Never);
    }
    [Fact]
    public async Task VerificationSerializesSourceProtectionAndRecoveryPreparation()
    {
        var archive = Archive(1); db.Add(archive); await db.SaveChangesAsync(); await Service(db).Enqueue(actor, archive.Id, default);
        await Assert.ThrowsAsync<BackupBusyException>(() => Service(db).Pin(archive.Id, true, actor, default));
        await Assert.ThrowsAsync<BackupBusyException>(() => Service(db).RecoveryPreflight(archive.Id, actor, true, default));
        await Service(db).Tick(default); await Service(db).Pin(archive.Id, true, actor, default); Assert.True(archive.Pinned);
    }
    [Fact]
    public async Task DiskAndUnavailableStorageHealthDisableOperations()
    {
        var directory = Path.Combine(Path.GetTempPath(), "wa-backup-disk-" + Guid.NewGuid().ToString("N"));
        var values = new Dictionary<string, string?> { ["Backup:Directory"] = directory, ["Backup:MinimumFreeBytes"] = long.MaxValue.ToString(), ["Backup:ActiveKeyId"] = "test", ["Backup:EncryptionKeys:test"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test;Username=test;Password=secret" };
        try
        {
            var cfg = new ConfigurationBuilder().AddInMemoryCollection(values).Build(); var health = new PostgresBackupEngine(cfg, AppContext.BaseDirectory, db).Health(); Assert.False(health.Ready); Assert.Contains("low_disk_space", health.Warnings); Assert.Equal("ephemeral", health.Durability);
            var blocker = Path.Combine(directory, "blocker"); File.WriteAllText(blocker, "fixture"); values["Backup:Directory"] = Path.Combine(blocker, "backups"); cfg = new ConfigurationBuilder().AddInMemoryCollection(values).Build(); Assert.False(new PostgresBackupEngine(cfg, AppContext.BaseDirectory, db).Health().Ready);
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
    [Fact]
    public void MissingToolsKeysStorageAndRemoteTlsAreReportedWithoutSecrets()
    {
        var temp = Path.Combine(Path.GetTempPath(), "wa-backup-health-" + Guid.NewGuid().ToString("N"));
        var values = new Dictionary<string, string?> { ["Backup:Directory"] = temp, ["Backup:MinimumFreeBytes"] = "0", ["Backup:ActiveKeyId"] = "test", ["Backup:EncryptionKeys:test"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), ["Backup:PostgresBinDirectory"] = Path.Combine(temp, "missing-tools"), ["ConnectionStrings:DefaultConnection"] = "Host=remote.invalid;Database=secret;Username=secret;Password=SECRET;Ssl Mode=Prefer" };
        try { var cfg = new ConfigurationBuilder().AddInMemoryCollection(values).Build(); var health = new PostgresBackupEngine(cfg, AppContext.BaseDirectory, db).Health(); Assert.False(health.Ready); Assert.Contains("postgres_tools_missing", health.Warnings); Assert.Contains("remote_database_requires_verified_tls", health.Warnings); Assert.DoesNotContain("SECRET", System.Text.Json.JsonSerializer.Serialize(health)); }
        finally { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
    }
}
