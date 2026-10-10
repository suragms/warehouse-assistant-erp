using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
namespace PurchaseAssistant.Infrastructure.Services.Backups;

public sealed class BackupLock : IAsyncDisposable
{
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<(int, string), SemaphoreSlim> Local = new();
    private NpgsqlConnection? connection; private SemaphoreSlim? semaphore; private int? heldKey;
    private BackupLock() { }
    public static async Task<BackupLock?> TryAsync(AppDbContext db, IConfiguration config, int key, CancellationToken ct)
    {
        var lease = new BackupLock();
        if (db.Database.IsNpgsql())
        {
            var settings = new NpgsqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection") ?? db.Database.GetConnectionString()) { Pooling = false, Timeout = 10, CommandTimeout = 5 };
            lease.connection = new NpgsqlConnection(settings.ConnectionString);
            try
            {
                await lease.connection.OpenAsync(ct);
                await using var cmd = new NpgsqlCommand("SELECT pg_try_advisory_lock(8675309, @key)", lease.connection); cmd.Parameters.AddWithValue("key", key);
                if ((bool)(await cmd.ExecuteScalarAsync(ct))!) { lease.heldKey = key; return lease; }
                await lease.DisposeAsync(); return null;
            }
            catch { await lease.DisposeAsync(); throw; }
        }
        lease.semaphore = Local.GetOrAdd((key, config["Backup:LockNamespace"] ?? "global"), _ => new SemaphoreSlim(1, 1));
        if (await lease.semaphore.WaitAsync(0, ct)) return lease;
        lease.semaphore = null; return null;
    }
    public async ValueTask DisposeAsync()
    {
        if (connection != null)
        {
            try
            {
                if (heldKey != null && connection.State == System.Data.ConnectionState.Open)
                { await using var cmd = new NpgsqlCommand("SELECT pg_advisory_unlock(8675309, @key)", connection); cmd.Parameters.AddWithValue("key", heldKey.Value); await cmd.ExecuteScalarAsync(); }
            }
            catch { /* Closing this nonpooled session also releases locks after connection failure. */ }
            finally { await connection.DisposeAsync(); connection = null; heldKey = null; }
        }
        semaphore?.Release(); semaphore = null;
    }
}
public class BackupBusyException : Exception;
public record DatabaseBackupOverview(DatabaseBackupSettings Settings, BackupHealth Health, DateTimeOffset? NextDaily, DateTimeOffset? NextMonthly, DateTime? LastSuccessful, DatabaseBackupJob[] Jobs, bool LiveRestoreEnabled = false);

public class DatabaseBackupService(AppDbContext db, IDatabaseBackupEngine engine, IConfiguration config, TimeProvider clock)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private void Audit(string action, Guid? actor, Guid? job = null) => db.DatabaseBackupEvents.Add(new() { Action = action, ActorId = actor, JobId = job, CreatedAt = Now });
    private async Task<BackupLock> WriteLock(CancellationToken ct) => await BackupLock.TryAsync(db, config, 1, ct) ?? throw new BackupBusyException();
    public async Task<DatabaseBackupSettings> Settings(CancellationToken ct) => await db.DatabaseBackupSettings.SingleOrDefaultAsync(ct) ?? new();
    public async Task<DatabaseBackupOverview> Overview(CancellationToken ct)
    {
        var s = await Settings(ct); var jobs = await db.DatabaseBackupJobs.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync(ct);
        var last = await db.DatabaseBackupJobs.Where(x => x.Status == "succeeded" && x.Kind != "verify").MaxAsync(x => x.CompletedAt, ct);
        return new(s, engine.Health(), BackupSchedule.Next(s, "daily", clock.GetUtcNow()), BackupSchedule.Next(s, "monthly", clock.GetUtcNow()), last, jobs);
    }
    public async Task<DatabaseBackupSettings> SaveSettings(DatabaseBackupSettings request, Guid actor, CancellationToken ct)
    {
        BackupSchedule.Validate(request);
        if ((request.DailyEnabled || request.MonthlyEnabled) && (!engine.Health().Ready || engine.Health().Durability != "persistent")) throw new ArgumentException("Automatic backups require healthy persistent storage.");
        await using var gate = await WriteLock(ct);
        var existing = await db.DatabaseBackupSettings.SingleOrDefaultAsync(ct);
        if (existing != null && request.Revision != existing.Revision) throw new DbUpdateConcurrencyException();
        request.Revision = Guid.NewGuid();
        if (existing == null) db.DatabaseBackupSettings.Add(request); else db.Entry(existing).CurrentValues.SetValues(request);
        foreach (var pending in await db.DatabaseBackupJobs.Where(x => x.ScheduleKey != null && (x.Status == "queued" || x.Status == "failed" || x.Status == "interrupted")).ToListAsync(ct))
            if (pending.Kind == "daily" && !request.DailyEnabled || pending.Kind == "monthly" && !request.MonthlyEnabled)
            { pending.Status = "cancelled"; pending.Stage = "Schedule disabled by operator"; pending.RetryAt = null; pending.Revision = Guid.NewGuid(); Audit("schedule_cancelled", actor, pending.Id); }
        Audit("settings_changed", actor); await db.SaveChangesAsync(ct); return request;
    }
    public async Task<DatabaseBackupJob> Enqueue(Guid actor, Guid? sourceId, CancellationToken ct)
    {
        if (!engine.Health().Ready) throw new BackupFailure("backup_health_not_ready");
        await using var gate = await WriteLock(ct);
        if (await db.DatabaseBackupJobs.AnyAsync(x => x.Status == "queued" || x.Status == "running", ct)) throw new BackupBusyException();
        if (sourceId != null) await RequireArchive(sourceId.Value, ct);
        var job = new DatabaseBackupJob { ActorId = actor, SourceId = sourceId, Kind = sourceId == null ? "manual" : "verify", CreatedAt = Now };
        db.DatabaseBackupJobs.Add(job); Audit(sourceId == null ? "manual_requested" : "verify_requested", actor, job.Id); await db.SaveChangesAsync(ct); return job;
    }
    public async Task<DatabaseBackupJob> RequireArchive(Guid id, CancellationToken ct)
    {
        var job = await db.DatabaseBackupJobs.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException();
        if (job.Status != "succeeded" || job.Kind == "verify" || job.Sha256 == null) throw new ArgumentException("Archive is unavailable."); return job;
    }
    public async Task<Stream> Download(Guid id, Guid actor, CancellationToken ct)
    {
        await RequireArchive(id, ct); var stream = engine.Open(id);
        try { Audit("downloaded", actor, id); await db.SaveChangesAsync(ct); return stream; } catch { await stream.DisposeAsync(); throw; }
    }
    private async Task EnsureDeletable(DatabaseBackupJob job, CancellationToken ct)
    {
        if (job.Pinned || await db.DatabaseBackupJobs.AnyAsync(x => x.SourceId == job.Id && (x.Status == "queued" || x.Status == "running"), ct)) throw new ArgumentException("Archive is protected or being verified.");
        // Keep a newer validated local archive of the same retention category before removing any success.
        var newer = await db.DatabaseBackupJobs.AsNoTracking().Where(x => x.Status == "succeeded" && x.Kind == job.Kind && x.VerifiedAt != null && x.Id != job.Id && x.CompletedAt >= job.CompletedAt).OrderByDescending(x => x.CompletedAt).ToArrayAsync(ct);
        var available = false;
        foreach (var candidate in newer)
        {
            try { await using var stream = engine.Open(candidate.Id); var hash = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(stream, ct)); if (hash == candidate.Sha256) { available = true; break; } }
            catch (Exception e) when (e is IOException or KeyNotFoundException or UnauthorizedAccessException or BackupFailure) { }
        }
        if (!available) throw new ArgumentException("A newer validated archive must remain available in this category.");
        if (string.Equals(config["Backup:RequireOffsiteBeforePrune"], "true", StringComparison.OrdinalIgnoreCase) && !job.OffsiteVerified) throw new ArgumentException("Offsite copy must be verified before removal.");
    }
    public async Task Delete(Guid id, Guid actor, CancellationToken ct)
    {
        await using var gate = await WriteLock(ct); var job = await RequireArchive(id, ct); await EnsureDeletable(job, ct);
        // Mark first: a crash leaves an inaccessible orphan, never a success record pointing at an intentionally removed file.
        job.Status = "deleted"; job.Stage = "Removed from local storage"; job.Revision = Guid.NewGuid(); Audit("deleted", actor, id);
        await db.SaveChangesAsync(ct); engine.Delete(id);
    }
    public async Task Pin(Guid id, bool pinned, Guid actor, CancellationToken ct)
    {
        await using var gate = await WriteLock(ct); var job = await RequireArchive(id, ct);
        if (await db.DatabaseBackupJobs.AnyAsync(x => x.SourceId == id && (x.Status == "queued" || x.Status == "running"), ct)) throw new BackupBusyException();
        job.Pinned = pinned; job.Revision = Guid.NewGuid(); Audit(pinned ? "pinned" : "unpinned", actor, id); await db.SaveChangesAsync(ct);
    }
    public async Task<object> RecoveryPreflight(Guid id, Guid actor, bool confirmed, CancellationToken ct)
    {
        if (!confirmed) throw new ArgumentException("Explicit recovery confirmation is required.");
        await using var gate = await WriteLock(ct); var job = await RequireArchive(id, ct);
        if (await db.DatabaseBackupJobs.AnyAsync(x => x.SourceId == id && (x.Status == "queued" || x.Status == "running"), ct)) throw new BackupBusyException();
        if (job.VerifiedAt == null || !await db.DatabaseBackupJobs.AnyAsync(x => x.Kind == "verify" && x.SourceId == id && x.Status == "succeeded" && x.CompletedAt >= Now.AddHours(-1), ct))
            throw new ArgumentException("Run explicit archive verification successfully within one hour before recovery preparation.");
        job.Pinned = true; job.Revision = Guid.NewGuid(); Audit("recovery_preflight_confirmed", actor, id); await db.SaveChangesAsync(ct);
        return new { archiveId = id, job.Sha256, job.VerifiedAt, liveRestoreEnabled = false, isolatedRestoreRequired = true, procedure = "docs/RECOVERY_DRILL.md", message = "Archive pinned. Reverify and restore to an empty isolated database with the recovery tool. Validate the application and external assets before an administrator-controlled cutover." };
    }
    public async Task Tick(CancellationToken ct)
    {
        await using var worker = await BackupLock.TryAsync(db, config, 2, ct); if (worker == null) return;
        DatabaseBackupJob? job;
        await using (var gate = await WriteLock(ct))
        {
            // Running-host execution is bounded below the 90-minute lease; a hard-crash child cannot publish.
            foreach (var interrupted in await db.DatabaseBackupJobs.Where(x => x.Status == "running" && x.LeaseUntil < Now).ToListAsync(ct))
            { interrupted.Status = "interrupted"; interrupted.ErrorCode = "worker_interrupted"; interrupted.CompletedAt = Now; interrupted.RetryAt = Now; interrupted.Revision = Guid.NewGuid(); Audit("interrupted", null, interrupted.Id); }
            await db.SaveChangesAsync(ct);
            var settings = await Settings(ct); var health = engine.Health();
            if (health.Ready && health.Durability == "persistent") foreach (var kind in new[] { "daily", "monthly" })
            {
                var due = BackupSchedule.Due(settings, kind, clock.GetUtcNow());
                if (due != null && due.Value.Due <= clock.GetUtcNow() && !await db.DatabaseBackupJobs.AnyAsync(x => x.ScheduleKey == due.Value.Key, ct))
                { var scheduled = new DatabaseBackupJob { Kind = kind, ScheduleKey = due.Value.Key, CreatedAt = Now }; db.DatabaseBackupJobs.Add(scheduled); Audit("scheduled", null, scheduled.Id); }
            }
            foreach (var retry in await db.DatabaseBackupJobs.Where(x => x.ScheduleKey != null && (x.Status == "failed" || x.Status == "interrupted") && x.Attempts < 3 && x.RetryAt <= Now).ToListAsync(ct))
            { if (retry.Kind == "daily" && !settings.DailyEnabled || retry.Kind == "monthly" && !settings.MonthlyEnabled) continue; retry.Status = "queued"; retry.Revision = Guid.NewGuid(); Audit("retry_queued", null, retry.Id); }
            await db.SaveChangesAsync(ct);
            if (await db.DatabaseBackupJobs.AnyAsync(x => x.Status == "running", ct)) return;
            job = await db.DatabaseBackupJobs.Where(x => x.Status == "queued").OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(ct);
            if (job == null) return;
            job.Status = "running"; job.StartedAt = Now; job.LeaseUntil = Now.AddMinutes(90); job.Attempts++; job.Revision = Guid.NewGuid(); job.ErrorCode = null; Audit("started", null, job.Id); await db.SaveChangesAsync(ct);
        }
        using var execution = CancellationTokenSource.CreateLinkedTokenSource(ct); execution.CancelAfter(TimeSpan.FromMinutes(75));
        try
        {
            if (job.Kind == "verify")
            {
                var source = await RequireArchive(job.SourceId!.Value, ct); await engine.VerifyAsync(source.Id, source.Sha256!, execution.Token); source.VerifiedAt = Now; source.Revision = Guid.NewGuid();
            }
            else
            {
                var artifact = await engine.CreateAsync(job.Id, async stage => { job.Stage = stage; job.Revision = Guid.NewGuid(); await db.SaveChangesAsync(execution.Token); }, execution.Token);
                job.SizeBytes = artifact.SizeBytes; job.Sha256 = artifact.Sha256; job.OffsiteVerified = artifact.OffsiteVerified; job.VerifiedAt = Now;
            }
            job.Status = "succeeded"; job.Stage = job.Kind == "verify" ? "Integrity and compatibility verified" : "Encrypted archive ready"; Audit("succeeded", null, job.Id);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        { job.Status = "interrupted"; job.ErrorCode = "worker_interrupted"; job.Stage = "Interrupted safely"; Audit("interrupted", null, job.Id); }
        catch (Exception e)
        { job.Status = "failed"; job.ErrorCode = e is BackupFailure f ? f.Code : e is OperationCanceledException ? "job_timeout" : e is IOException ? "storage_or_disk_failure" : e is System.Security.Cryptography.CryptographicException or InvalidDataException ? "integrity_failed" : "backup_failed"; job.Stage = "Failed; existing archives preserved"; Audit("failed", null, job.Id); }
        job.CompletedAt = Now; job.LeaseUntil = null; job.RetryAt = Now.AddMinutes(job.Attempts * 10); job.Revision = Guid.NewGuid();
        // Persist cancellation outcome after native process shutdown. Do not retry writes indefinitely during database outages.
        using var finalTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30)); await db.SaveChangesAsync(finalTimeout.Token);
        if (job.Status == "succeeded" && job.Kind != "verify") await Prune(finalTimeout.Token);
    }
    public async Task Prune(CancellationToken ct)
    {
        await using var gate = await WriteLock(ct); var settings = await Settings(ct);
        foreach (var (kind, keep) in new[] { ("daily", settings.DailyRetention), ("monthly", settings.MonthlyRetention), ("manual", settings.ManualRetention) })
        {
            var candidates = await db.DatabaseBackupJobs.Where(x => x.Kind == kind && x.Status == "succeeded").OrderByDescending(x => x.CompletedAt).Skip(keep).ToListAsync(ct);
            foreach (var job in candidates)
            {
                try { await EnsureDeletable(job, ct); } catch (ArgumentException) { continue; }
                job.Status = "deleted"; job.Stage = "Local retention expired"; job.Revision = Guid.NewGuid(); Audit("retention_deleted", null, job.Id); await db.SaveChangesAsync(ct); engine.Delete(job.Id);
            }
        }
    }
}
