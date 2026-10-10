using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.Backups;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Text.Json;
namespace PurchaseAssistant.IntegrationTests;

public class DatabaseBackupIntegrationTests
{
    [RequiresDisposablePostgresFact]
    public async Task NativeEncryptedArchiveRestoresRealSchemaAllTenantsInventoryAndHistoryToEmptyIsolatedDatabase()
    {
        var target = Environment.GetEnvironmentVariable("PURCHASE_ASSISTANT_RESTORE_TEST_DATABASE") ?? throw new InvalidOperationException("Run scripts/run-postgres-integration-tests.ps1 for the guarded restore database.");
        var parsed = new NpgsqlConnectionStringBuilder(target);
        Assert.StartsWith("wa_test_restore_", parsed.Database); Assert.Equal("127.0.0.1", parsed.Host);
        var directory = Path.Combine(Path.GetTempPath(), "wa-native-backup-" + Guid.NewGuid().ToString("N"));
        var offsite = directory + "-offsite"; var business = Guid.NewGuid(); var foreign = Guid.NewGuid(); var archive = Guid.NewGuid();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = DisposablePostgres.ConnectionString, ["Backup:Directory"] = directory, ["Backup:OffsiteDirectory"] = offsite,
            ["Backup:StorageDurability"] = "persistent", ["Backup:MinimumFreeBytes"] = "0", ["Backup:ActiveKeyId"] = "drill", ["Backup:EncryptionKeys:drill"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        }).Build();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(DisposablePostgres.ConnectionString).Options);
        var category = new Category { BusinessId = business, Name = "Recovery category" };
        var foreignCategory = new Category { BusinessId = foreign, Name = "Other tenant category" };
        var item = new CatalogItem { BusinessId = business, CategoryId = category.Id, Name = "Recovery item", ItemCode = "DRILL", Barcode = "BACKUP-DRILL", CurrentStock = 17, PhysicalStock = 15, ReservedStock = 2 };
        var other = new CatalogItem { BusinessId = foreign, CategoryId = foreignCategory.Id, Name = "Second tenant", ItemCode = "DRILL", Barcode = "BACKUP-DRILL", CurrentStock = 9 };
        db.AddRange(new Business { Id = business, Name = "Restore drill" }, new Business { Id = foreign, Name = "Other restore tenant" }, category, foreignCategory, item, other); await db.SaveChangesAsync();
        var before = JsonSerializer.Serialize(await db.CatalogItems.IgnoreQueryFilters().Where(x => x.Id == item.Id || x.Id == other.Id).OrderBy(x => x.Id).AsNoTracking().ToArrayAsync());
        var engine = new PostgresBackupEngine(config, AppContext.BaseDirectory, db);
        try
        {
            Assert.True(engine.Health().Ready, string.Join(',', engine.Health().Warnings));
            var service = new DatabaseBackupService(db, engine, config, TimeProvider.System);
            var job = await service.Enqueue(Guid.NewGuid(), null, default); archive = job.Id;
            Assert.Equal("queued", job.Status); await Assert.ThrowsAsync<BackupBusyException>(() => service.Enqueue(Guid.NewGuid(), null, default));
            await service.Tick(default); Assert.Equal("succeeded", job.Status);
            var artifact = new BackupArtifact(job.SizeBytes!.Value, job.Sha256!, job.OffsiteVerified); Assert.True(artifact.OffsiteVerified); Assert.True(artifact.SizeBytes > 0);
            Assert.Single(Directory.GetFiles(directory, "*.wab")); Assert.Empty(Directory.GetDirectories(directory, ".work-*"));
            var file = Path.Combine(directory, archive.ToString("N") + ".wab"); var bytes = await File.ReadAllBytesAsync(file); Assert.Equal("WABK0001", System.Text.Encoding.ASCII.GetString(bytes, 0, 8));
            Assert.DoesNotContain("BACKUP-DRILL", System.Text.Encoding.ASCII.GetString(bytes));
            var verified = await engine.VerifyAsync(archive, artifact.Sha256, default); Assert.Contains("StockMovements", verified.Tables.Keys); Assert.Contains("__EFMigrationsHistory", verified.Tables.Keys);
            var binary = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../PurchaseAssistant.RecoveryTool/bin/Release/net10.0/PurchaseAssistant.RecoveryTool.dll"));
            Assert.True(File.Exists(binary), "Build the RecoveryTool before running the drill.");
            var recoveryActor = Guid.NewGuid();
            foreach (var mode in new[] { "inspect", "verify", "restore-isolated-offline", "verify-offline" })
            {
                var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (var arg in new[] { binary, mode.StartsWith("restore-isolated") ? "restore-isolated" : mode == "inspect" ? "inspect" : "verify", archive.ToString(), artifact.Sha256 }) start.ArgumentList.Add(arg);
                if (mode.StartsWith("restore-isolated")) start.ArgumentList.Add("--confirm-isolated");
                foreach (var pair in config.AsEnumerable().Where(p => p.Value != null)) start.Environment[pair.Key.Replace(":", "__")] = pair.Value!;
                if (mode.EndsWith("offline")) start.Environment["ConnectionStrings__DefaultConnection"] = "Host=127.0.0.1;Port=1;Database=offline;Username=offline;Password=secret;Timeout=1;Command Timeout=1";
                start.Environment["Backup__RecoveryTargetConnection"] = target; start.Environment["Backup__RecoveryActorId"] = recoveryActor.ToString(); start.Environment["Backup__RecoveryOperatorUserIds__0"] = recoveryActor.ToString();
                using var process = Process.Start(start)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                using var limit = new CancellationTokenSource(TimeSpan.FromMinutes(2)); await process.WaitForExitAsync(limit.Token); var diagnostics = await output + await error;
                Assert.Equal(0, process.ExitCode); Assert.Contains("Verified archive", diagnostics); if (mode.EndsWith("offline")) Assert.Contains("Encrypted operator event saved", diagnostics); Assert.DoesNotContain(new NpgsqlConnectionStringBuilder(DisposablePostgres.ConnectionString).Password!, diagnostics);
            }
            Assert.Equal(8, Directory.GetFiles(directory, "*.wabevent").Length);
            var actions = new List<string>();
            foreach (var auditPath in Directory.GetFiles(directory, "*.wabevent"))
            {
                await using var input = File.OpenRead(auditPath); using var plain = new MemoryStream();
                await BackupEncryption.DecryptAsync(input, plain, key => Convert.FromBase64String(config[$"Backup:EncryptionKeys:{key}"]!), default);
                using var audit = JsonDocument.Parse(plain.ToArray()); actions.Add(audit.RootElement.GetProperty("action").GetString()!);
            }
            Assert.Contains("isolated_restore_verified", actions);
            Assert.True(await db.DatabaseBackupEvents.AnyAsync(e => e.JobId == archive && e.Action == "cli_verified"));
            await using var recovery = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(target).Options);
            Assert.Equal(before, JsonSerializer.Serialize(await recovery.CatalogItems.IgnoreQueryFilters().Where(x => x.Id == item.Id || x.Id == other.Id).OrderBy(x => x.Id).AsNoTracking().ToArrayAsync()));
            Assert.Equal(before, JsonSerializer.Serialize(await db.CatalogItems.IgnoreQueryFilters().Where(x => x.Id == item.Id || x.Id == other.Id).OrderBy(x => x.Id).AsNoTracking().ToArrayAsync()));
            await Assert.ThrowsAsync<BackupFailure>(() => engine.RestoreIsolatedAsync(archive, artifact.Sha256, DisposablePostgres.ConnectionString, default));
            await Assert.ThrowsAsync<BackupFailure>(() => engine.RestoreIsolatedAsync(archive, artifact.Sha256, target, default));
            bytes[^1] ^= 1; await File.WriteAllBytesAsync(file, bytes); await Assert.ThrowsAsync<BackupFailure>(() => engine.VerifyAsync(archive, artifact.Sha256, default));
        }
        finally
        {
            // Only random fixture business IDs in the explicitly guarded disposable cluster; no live database commands.
            await db.Database.ExecuteSqlRawAsync("""DELETE FROM "CatalogItems" WHERE "BusinessId" IN ({0},{1})""", business, foreign);
            await db.Database.ExecuteSqlRawAsync("""DELETE FROM "Categories" WHERE "BusinessId" IN ({0},{1})""", business, foreign);
            await db.Database.ExecuteSqlRawAsync("""DELETE FROM "Businesses" WHERE "Id" IN ({0},{1})""", business, foreign);
            await db.Database.ExecuteSqlRawAsync("""DELETE FROM "DatabaseBackupEvents" WHERE "JobId" = {0}""", archive);
            await db.Database.ExecuteSqlRawAsync("""DELETE FROM "DatabaseBackupJobs" WHERE "Id" = {0}""", archive);
            if (Directory.Exists(directory)) Directory.Delete(directory, true); if (Directory.Exists(offsite)) Directory.Delete(offsite, true);
        }
    }
    [RequiresDisposablePostgresFact]
    public async Task AdvisoryLocksExcludeOtherSessionsAndReleaseOnDispose()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = DisposablePostgres.ConnectionString }).Build();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(DisposablePostgres.ConnectionString).Options);
        var first = await BackupLock.TryAsync(db, config, 777, default); Assert.NotNull(first);
        try { Assert.Null(await BackupLock.TryAsync(db, config, 777, default)); }
        finally { await first.DisposeAsync(); }
        await using var reacquired = await BackupLock.TryAsync(db, config, 777, default); Assert.NotNull(reacquired);
    }
    [RequiresDisposablePostgresFact]
    public async Task DatabaseEnforcesScheduledKeyUniquenessAndSettingsValidity()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(DisposablePostgres.ConnectionString).Options);
        var key = "daily:test:" + Guid.NewGuid().ToString("N"); var job = new DatabaseBackupJob { ScheduleKey = key, CreatedAt = DateTime.UtcNow };
        db.Add(job); await db.SaveChangesAsync();
        try
        {
            db.Add(new DatabaseBackupJob { ScheduleKey = key, CreatedAt = DateTime.UtcNow }); var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal("23505", ((PostgresException)exception.InnerException!).SqlState);
            db.ChangeTracker.Clear(); db.Add(new DatabaseBackupSettings { Id = 2 }); exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal("23514", ((PostgresException)exception.InnerException!).SqlState);
        }
        finally { db.ChangeTracker.Clear(); await db.Database.ExecuteSqlRawAsync("""DELETE FROM "DatabaseBackupJobs" WHERE "Id" = {0}""", job.Id); }
    }
}
