using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.Backups;

// Administrator CLI, no HTTP restore surface. Credentials and keys are environment/secret-store supplied.
if (args.Length < 3 || args[0] is not ("inspect" or "verify" or "restore-isolated") || !Guid.TryParse(args[1], out var id) || !System.Text.RegularExpressions.Regex.IsMatch(args[2], "^[A-Fa-f0-9]{64}$"))
{ Console.Error.WriteLine("Usage: inspect <archive-id> <sha256> | verify <archive-id> <sha256> | restore-isolated <archive-id> <sha256> --confirm-isolated"); return 2; }
var config = new ConfigurationBuilder().AddEnvironmentVariables().Build();
using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(60));
try
{
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.GetConnectionString("DefaultConnection")).Options);
    var engine = new PostgresBackupEngine(config, AppContext.BaseDirectory, db);
    if (!Guid.TryParse(config["Backup:RecoveryActorId"], out var actor) || !(config.GetSection("Backup:RecoveryOperatorUserIds").GetChildren().Any(x => Guid.TryParse(x.Value, out var allowed) && allowed == actor))) throw new BackupFailure("recovery_operator_not_configured");
    async Task Audit(string action)
    {
        // Recovery must remain possible when the source database and its job table are unavailable.
        await engine.RecordRecoveryAuditAsync(action, actor, id, timeout.Token);
        try
        {
            db.DatabaseBackupEvents.Add(new DatabaseBackupEvent { ActorId = actor, JobId = id, Action = action, CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync(timeout.Token);
        }
        catch (Exception) when (!timeout.IsCancellationRequested)
        { db.ChangeTracker.Clear(); Console.Error.WriteLine("Source database audit unavailable. Encrypted operator event saved in protected recovery storage."); }
    }
    await Audit(args[0] == "inspect" ? "cli_inspect_requested" : args[0] == "verify" ? "cli_verify_requested" : "isolated_restore_requested");
    BackupManifest manifest;
    if (args[0] == "restore-isolated")
    {
        if (args.Length != 4 || args[3] != "--confirm-isolated") throw new BackupFailure("confirmation_required");
        manifest = await engine.RestoreIsolatedAsync(id, args[2].ToUpperInvariant(), config["Backup:RecoveryTargetConnection"] ?? "", timeout.Token);
    }
    else manifest = args[0] == "inspect" ? await engine.InspectAsync(id, args[2].ToUpperInvariant(), timeout.Token) : await engine.VerifyAsync(id, args[2].ToUpperInvariant(), timeout.Token);
    await Audit(args[0] == "inspect" ? "cli_inspected" : args[0] == "verify" ? "cli_verified" : "isolated_restore_verified");
    if (args[0] == "inspect") Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { manifest.Id, manifest.CreatedAt, manifest.ServerVersion, manifest.Migrations, tableCount = manifest.Tables.Count, compatible = manifest.Migrations.SequenceEqual(db.Database.GetMigrations()) }));
    Console.WriteLine($"Verified archive {manifest.Id}: {manifest.Tables.Count} public tables; {manifest.Migrations.Length} migrations. Live database was not restored."); return 0;
}
catch (Exception e)
{
    Console.Error.WriteLine(e is BackupFailure f ? f.Code : "recovery_failed"); return 1;
}
