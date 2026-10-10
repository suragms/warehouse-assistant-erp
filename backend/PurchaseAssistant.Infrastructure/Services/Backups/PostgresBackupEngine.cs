using System.Diagnostics;
using System.IO.Compression;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using PurchaseAssistant.Infrastructure.Data;
namespace PurchaseAssistant.Infrastructure.Services.Backups;

public record BackupHealth(bool Ready, string Destination, string Durability, bool OffsiteConfigured, string[] Warnings);
public record BackupArtifact(long SizeBytes, string Sha256, bool OffsiteVerified);
public record BackupManifest(int Version, Guid Id, DateTime CreatedAt, string SourceFingerprint, string ServerVersion, string[] Migrations, Dictionary<string, long> Tables, string DumpSha256);
public class BackupFailure(string code) : Exception(code) { public string Code { get; } = code; }
public interface IDatabaseBackupEngine
{
    BackupHealth Health();
    Task<BackupArtifact> CreateAsync(Guid id, Func<string, Task> progress, CancellationToken ct);
    Task<BackupManifest> VerifyAsync(Guid id, string sha256, CancellationToken ct);
    Stream Open(Guid id);
    void Delete(Guid id);
}

public class PostgresBackupEngine(IConfiguration config, string contentRoot, AppDbContext db) : IDatabaseBackupEngine
{
    private string Root => ValidateRoot(config["Backup:Directory"]);
    private long MaxBytes => long.TryParse(config["Backup:MaxArchiveBytes"], out var max) && max > 0 ? max : 1_099_511_627_776;
    private byte[] Key(string id)
    {
        try { var key = Convert.FromBase64String(config[$"Backup:EncryptionKeys:{id}"] ?? ""); if (key.Length == 32) return key; } catch (FormatException) { }
        throw new BackupFailure("encryption_key_unavailable");
    }
    private string ActiveKey => config["Backup:ActiveKeyId"] ?? "";
    private string ValidateRoot(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured) || !Path.IsPathFullyQualified(configured)) throw new BackupFailure("storage_not_configured");
        var path = Path.GetFullPath(configured).TrimEnd(Path.DirectorySeparatorChar);
        var content = Path.GetFullPath(contentRoot).TrimEnd(Path.DirectorySeparatorChar);
        if (path.Equals(content, StringComparison.OrdinalIgnoreCase) || path.StartsWith(content + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || path == Path.GetPathRoot(path)?.TrimEnd(Path.DirectorySeparatorChar)) throw new BackupFailure("unsafe_storage_location");
        for (var ancestor = new DirectoryInfo(contentRoot); ancestor != null; ancestor = ancestor.Parent)
            if (Directory.Exists(Path.Combine(ancestor.FullName, ".git")) || File.Exists(Path.Combine(ancestor.FullName, ".git")))
            {
                var repository = ancestor.FullName.TrimEnd(Path.DirectorySeparatorChar);
                if (path.Equals(repository, StringComparison.OrdinalIgnoreCase) || path.StartsWith(repository + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new BackupFailure("unsafe_storage_location");
                break;
            }
        for (var dir = new DirectoryInfo(path); dir != null; dir = dir.Parent)
            if (dir.Exists && (dir.Attributes & FileAttributes.ReparsePoint) != 0) throw new BackupFailure("unsafe_storage_link");
        var marker = Path.Combine(path, ".warehouse-backup-storage");
        if (Directory.Exists(path) && !File.Exists(marker) && Directory.EnumerateFileSystemEntries(path).Any()) throw new BackupFailure("storage_directory_not_dedicated");
        if (File.Exists(marker) && (File.GetAttributes(marker) & FileAttributes.ReparsePoint) != 0) throw new BackupFailure("unsafe_storage_link");
        Directory.CreateDirectory(path); RestrictDirectory(path);
        if (!File.Exists(marker)) { using var file = PrivateFile(marker); file.Write("WABK0001"u8); file.Flush(true); }
        return path;
    }
    private static void RestrictDirectory(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false);
            var inherit = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            foreach (var sid in new[] { WindowsIdentity.GetCurrent().User!, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null) })
                security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(path).SetAccessControl(security);
        }
        else File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    }
    private static FileStream PrivateFile(string path)
    {
        var stream = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 65536, FileOptions.Asynchronous);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        return stream;
    }
    private string ArchivePath(Guid id) => Path.Combine(Root, $"{id:N}.wab");
    public BackupHealth Health()
    {
        var warnings = new List<string>(); var ready = true;
        try
        {
            var root = Root; var probe = Path.Combine(root, $".probe-{Guid.NewGuid():N}");
            using (var file = PrivateFile(probe)) { file.WriteByte(1); file.Flush(true); } File.Delete(probe);
            var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            var rooted = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var volume = DriveInfo.GetDrives().Where(d => rooted.StartsWith(d.Name.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, comparison))
                .OrderByDescending(d => d.Name.Length).FirstOrDefault() ?? new DriveInfo(Path.GetPathRoot(root)!);
            var free = volume.AvailableFreeSpace;
            if (free < (long.TryParse(config["Backup:MinimumFreeBytes"], out var minimum) && minimum >= 0 ? minimum : 1_073_741_824)) { warnings.Add("low_disk_space"); ready = false; }
            if (ActiveKey.Length is < 1 or > 64 || ActiveKey.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) throw new BackupFailure("encryption_key_unavailable");
            CryptographicOperations.ZeroMemory(Key(ActiveKey));
            if (!ToolAvailable("pg_dump") || !ToolAvailable("pg_restore")) { warnings.Add("postgres_tools_missing"); ready = false; }
            Connection();
        }
        catch (BackupFailure e) { warnings.Add(e.Code); ready = false; }
        catch { warnings.Add("storage_unavailable"); ready = false; }
        var durability = config["Backup:StorageDurability"] ?? "unknown";
        var configuredRoot = config["Backup:Directory"];
        if (!string.IsNullOrWhiteSpace(configuredRoot) && Path.IsPathFullyQualified(configuredRoot))
        {
            var temporary = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (Path.GetFullPath(configuredRoot).StartsWith(temporary, StringComparison.OrdinalIgnoreCase)) durability = "ephemeral";
        }
        if (Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true" && durability == "unknown") durability = "ephemeral";
        if (durability != "persistent") warnings.Add("storage_durability_unconfirmed");
        var offsite = !string.IsNullOrWhiteSpace(config["Backup:OffsiteDirectory"]);
        if (!offsite) warnings.Add("offsite_copy_not_configured");
        if (!offsite && config["Backup:RequireOffsiteBeforePrune"] == "true") warnings.Add("retention_paused_without_verified_offsite");
        warnings.Add("external_assets_and_roles_require_separate_recovery");
        return new(ready, "Protected server storage", durability, offsite, warnings.ToArray());
    }
    private string Tool(string name)
    {
        var directory = config["Backup:PostgresBinDirectory"];
        if (directory != null && !Path.IsPathFullyQualified(directory)) throw new BackupFailure("postgres_tools_missing");
        return directory == null ? name : Path.Combine(directory, name + (OperatingSystem.IsWindows() ? ".exe" : ""));
    }
    private bool ToolAvailable(string name)
    {
        var tool = Tool(name);
        if (Path.IsPathFullyQualified(tool)) return File.Exists(tool);
        return (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator).Any(p => File.Exists(Path.Combine(p, tool + (OperatingSystem.IsWindows() ? ".exe" : ""))));
    }
    private NpgsqlConnectionStringBuilder Connection(string? value = null)
    {
        try
        {
            var c = new NpgsqlConnectionStringBuilder(value ?? config.GetConnectionString("DefaultConnection"));
            if (string.IsNullOrWhiteSpace(c.Host) || string.IsNullOrWhiteSpace(c.Database) || string.IsNullOrWhiteSpace(c.Username) || c.Host.Contains(',') || c.Host.StartsWith('/')) throw new BackupFailure("unsupported_database_connection");
            if (c.Host is not ("localhost" or "127.0.0.1" or "::1") && c.SslMode != SslMode.VerifyFull) throw new BackupFailure("remote_database_requires_verified_tls");
            return c;
        }
        catch (BackupFailure) { throw; } catch { throw new BackupFailure("database_not_configured"); }
    }
    private static string Fingerprint(NpgsqlConnectionStringBuilder c) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{c.Host!.ToLowerInvariant()}:{c.Port}:{c.Database}")));
    private async Task RunAsync(string name, IEnumerable<string> args, NpgsqlConnectionStringBuilder? connection, CancellationToken ct)
    {
        var start = new ProcessStartInfo(Tool(name)) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (var arg in args) start.ArgumentList.Add(arg);
        // Explicit connection environment overrides any inherited pg_service/default-database settings.
        foreach (var key in start.Environment.Keys.Where(k => k.StartsWith("PG", StringComparison.Ordinal)).ToArray()) start.Environment.Remove(key);
        if (connection != null)
        {
            start.Environment["PGHOST"] = connection.Host; start.Environment["PGPORT"] = connection.Port.ToString(); start.Environment["PGDATABASE"] = connection.Database;
            start.Environment["PGUSER"] = connection.Username; start.Environment["PGPASSWORD"] = connection.Password; start.Environment["PGCONNECT_TIMEOUT"] = "15";
            start.Environment["PGSSLMODE"] = connection.SslMode switch { SslMode.VerifyFull => "verify-full", SslMode.VerifyCA => "verify-ca", SslMode.Require => "require", SslMode.Disable => "disable", _ => "prefer" };
            if (!string.IsNullOrWhiteSpace(connection.RootCertificate)) start.Environment["PGSSLROOTCERT"] = connection.RootCertificate;
        }
        using var process = new Process { StartInfo = start }; using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromMinutes(40));
        try
        {
            if (!process.Start()) throw new BackupFailure("postgres_tools_missing");
            // Drain without retaining PostgreSQL diagnostics, which can contain tenant data and connection details.
            var stdout = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null); var stderr = process.StandardError.BaseStream.CopyToAsync(Stream.Null);
            await process.WaitForExitAsync(timeout.Token); await Task.WhenAll(stdout, stderr);
            if (process.ExitCode != 0) throw new BackupFailure(name == "pg_dump" ? "dump_failed" : "archive_or_restore_failed");
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(CancellationToken.None); }
            if (ct.IsCancellationRequested) throw; throw new BackupFailure("process_timeout");
        }
        catch (System.ComponentModel.Win32Exception) { throw new BackupFailure("postgres_tools_missing"); }
    }
    private static async Task<string> Hash(string path, CancellationToken ct)
    { await using var file = File.OpenRead(path); return Convert.ToHexString(await SHA256.HashDataAsync(file, ct)); }
    private string Workspace()
    { var path = Path.Combine(Root, $".work-{Guid.NewGuid():N}"); Directory.CreateDirectory(path); RestrictDirectory(path); return path; }
    private async Task<Dictionary<string, long>> Counts(NpgsqlConnection c, NpgsqlTransaction? tx, CancellationToken ct)
    {
        var names = new List<string>();
        await using (var cmd = new NpgsqlCommand("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename", c, tx))
        await using (var reader = await cmd.ExecuteReaderAsync(ct)) while (await reader.ReadAsync(ct)) names.Add(reader.GetString(0));
        var counts = new Dictionary<string, long>();
        foreach (var name in names)
        { await using var cmd = new NpgsqlCommand("SELECT count(*) FROM public.\"" + name.Replace("\"", "\"\"") + "\"", c, tx); counts[name] = (long)(await cmd.ExecuteScalarAsync(ct))!; }
        return counts;
    }
    private static async Task<string[]> Migrations(NpgsqlConnection c, NpgsqlTransaction? tx, CancellationToken ct)
    {
        var result = new List<string>();
        await using var cmd = new NpgsqlCommand("SELECT \"MigrationId\" FROM public.\"__EFMigrationsHistory\" ORDER BY \"MigrationId\"", c, tx);
        await using var reader = await cmd.ExecuteReaderAsync(ct); while (await reader.ReadAsync(ct)) result.Add(reader.GetString(0)); return result.ToArray();
    }
    public async Task<BackupArtifact> CreateAsync(Guid id, Func<string, Task> progress, CancellationToken ct)
    {
        if (!Health().Ready) throw new BackupFailure("backup_health_not_ready");
        var work = Workspace(); var dump = Path.Combine(work, "database.dump"); var package = Path.Combine(work, "package.zip"); var partial = Path.Combine(work, "archive.partial");
        try
        {
            var source = Connection(); await using var connection = new NpgsqlConnection(source.ConnectionString); await connection.OpenAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
            await using var export = new NpgsqlCommand("SELECT pg_export_snapshot()", connection, transaction);
            var snapshot = (string)(await export.ExecuteScalarAsync(ct))!;
            var tables = await Counts(connection, transaction, ct); var migrations = await Migrations(connection, transaction, ct);
            await progress("Creating consistent PostgreSQL archive");
            await RunAsync("pg_dump", new[] { "--format=custom", "--no-owner", "--no-acl", "--no-password", "--snapshot=" + snapshot, "--file=" + dump }, source, ct);
            await transaction.CommitAsync(ct);
            if (!File.Exists(dump) || new FileInfo(dump).Length is < 5 || new FileInfo(dump).Length > MaxBytes) throw new BackupFailure("archive_size_invalid");
            await RunAsync("pg_restore", new[] { "--list", dump }, null, ct);
            var manifest = new BackupManifest(1, id, DateTime.UtcNow, Fingerprint(source), connection.PostgreSqlVersion.ToString(), migrations, tables, await Hash(dump, ct));
            await progress("Encrypting and checking archive");
            await using (var stream = PrivateFile(package))
            {
                using var zip = new ZipArchive(stream, ZipArchiveMode.Create, true);
                await using (var m = zip.CreateEntry("manifest.json", CompressionLevel.NoCompression).Open()) await JsonSerializer.SerializeAsync(m, manifest, cancellationToken: ct);
                await using var d = zip.CreateEntry("database.dump", CompressionLevel.NoCompression).Open(); await using var input = File.OpenRead(dump); await input.CopyToAsync(d, ct);
            }
            var key = Key(ActiveKey);
            try { await using var input = File.OpenRead(package); await using var output = PrivateFile(partial); await BackupEncryption.EncryptAsync(input, output, ActiveKey, key, ct); output.Flush(true); }
            finally { CryptographicOperations.ZeroMemory(key); }
            var hash = await Hash(partial, ct);
            // Validate the encrypted result before publication, not only the original dump.
            await UnpackAsync(partial, id, hash, work, ct);
            var final = ArchivePath(id); File.Move(partial, final, false);
            var offsite = await CopyOffsiteAsync(id, final, hash, ct);
            return new(new FileInfo(final).Length, hash, offsite);
        }
        finally { Directory.Delete(work, true); }
    }
    private async Task<bool> CopyOffsiteAsync(Guid id, string source, string hash, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config["Backup:OffsiteDirectory"])) return false;
        string? partial = null;
        try
        {
            var root = ValidateRoot(config["Backup:OffsiteDirectory"]);
            if (root.Equals(Root, StringComparison.OrdinalIgnoreCase)) return false;
            partial = Path.Combine(root, $".{id:N}-{Guid.NewGuid():N}.partial");
            await using (var input = File.OpenRead(source)) await using (var output = PrivateFile(partial)) { await input.CopyToAsync(output, ct); output.Flush(true); }
            if (await Hash(partial, ct) != hash) throw new BackupFailure("offsite_integrity_failed");
            File.Move(partial, Path.Combine(root, $"{id:N}.wab"), false); return true;
        }
        catch (OperationCanceledException) { throw; }
        catch { return false; }
        finally { if (partial != null && File.Exists(partial)) File.Delete(partial); }
    }
    private async Task<BackupManifest> UnpackAsync(string archive, Guid id, string hash, string work, CancellationToken ct, bool requireCompatible = true)
    {
        if (new FileInfo(archive).Length > MaxBytes || await Hash(archive, ct) != hash) throw new BackupFailure("integrity_failed");
        var zipPath = Path.Combine(work, "verified.zip"); var dumpPath = Path.Combine(work, "verified.dump");
        await using (var input = File.OpenRead(archive)) await using (var output = PrivateFile(zipPath)) await BackupEncryption.DecryptAsync(input, output, Key, ct);
        using var zip = ZipFile.OpenRead(zipPath);
        if (zip.Entries.Count != 2 || zip.Entries.Count(x => x.FullName == "manifest.json") != 1 || zip.Entries.Count(x => x.FullName == "database.dump") != 1) throw new BackupFailure("unsupported_archive");
        var entry = zip.GetEntry("manifest.json")!; if (entry.Length > 1_048_576) throw new BackupFailure("unsupported_archive");
        BackupManifest manifest;
        await using (var stream = entry.Open()) manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(stream, cancellationToken: ct) ?? throw new BackupFailure("unsupported_archive");
        if (manifest.Version != 1 || manifest.Id != id || manifest.Tables == null || manifest.Migrations == null || requireCompatible && !manifest.Migrations.SequenceEqual(db.Database.GetMigrations())) throw new BackupFailure("schema_incompatible");
        var dump = zip.GetEntry("database.dump")!; if (dump.Length < 5 || dump.Length > MaxBytes) throw new BackupFailure("archive_size_invalid");
        await using (var input = dump.Open()) await using (var output = PrivateFile(dumpPath)) await input.CopyToAsync(output, ct);
        if (await Hash(dumpPath, ct) != manifest.DumpSha256) throw new BackupFailure("integrity_failed");
        await RunAsync("pg_restore", new[] { "--list", dumpPath }, null, ct); return manifest;
    }
    public async Task<BackupManifest> VerifyAsync(Guid id, string sha256, CancellationToken ct)
    {
        var work = Workspace();
        try { return await UnpackAsync(ArchivePath(id), id, sha256, work, ct); }
        finally { Directory.Delete(work, true); }
    }
    public async Task<BackupManifest> InspectAsync(Guid id, string sha256, CancellationToken ct)
    {
        var work = Workspace();
        try { return await UnpackAsync(ArchivePath(id), id, sha256, work, ct, false); }
        finally { Directory.Delete(work, true); }
    }
    public Stream Open(Guid id)
    {
        var path = ArchivePath(id);
        if (!File.Exists(path) || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new KeyNotFoundException();
        return new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete, 65536, FileOptions.Asynchronous);
    }
    public void Delete(Guid id)
    {
        var path = ArchivePath(id);
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new BackupFailure("unsafe_storage_link");
        File.Delete(path); // Offsite copies are deliberately retained until an independently approved offsite retention operation.
    }
    public async Task RecordRecoveryAuditAsync(string action, Guid actor, Guid id, CancellationToken ct)
    {
        if (action is not ("cli_inspect_requested" or "cli_inspected" or "cli_verify_requested" or "cli_verified" or "isolated_restore_requested" or "isolated_restore_verified" or "cli_recovery_failed")) throw new ArgumentException("Invalid audit action.");
        var path = Path.Combine(Root, $"recovery-event-{DateTime.UtcNow:yyyyMMddTHHmmss}-{Guid.NewGuid():N}.wabevent");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { action, actorId = actor, archiveId = id, at = DateTime.UtcNow }); var key = Key(ActiveKey);
        try { await using var output = PrivateFile(path); using var input = new MemoryStream(bytes); await BackupEncryption.EncryptAsync(input, output, ActiveKey, key, ct); output.Flush(true); }
        finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(bytes); }
    }
    // Never reachable through HTTP. Empty, loopback, specially named target only; no --clean/--create flags.
    public async Task<BackupManifest> RestoreIsolatedAsync(Guid id, string sha256, string targetConnection, CancellationToken ct)
    {
        var source = Connection(); var target = Connection(targetConnection);
        if (target.Host is not ("localhost" or "127.0.0.1" or "::1") || target.Port == source.Port && target.Database == source.Database
            || !System.Text.RegularExpressions.Regex.IsMatch(target.Database!, "^wa_(restore|test_restore)_[a-f0-9]{32}$")) throw new BackupFailure("unsafe_restore_target");
        await using var connection = new NpgsqlConnection(target.ConnectionString); await connection.OpenAsync(ct);
        await using (var empty = new NpgsqlCommand("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'", connection))
            if ((long)(await empty.ExecuteScalarAsync(ct))! != 0) throw new BackupFailure("restore_target_not_empty");
        var work = Workspace();
        try
        {
            var manifest = await UnpackAsync(ArchivePath(id), id, sha256, work, ct);
            await RunAsync("pg_restore", new[] { "--no-password", "--no-owner", "--no-acl", "--single-transaction", "--exit-on-error", "--dbname=" + target.Database, Path.Combine(work, "verified.dump") }, target, ct);
            var tables = await Counts(connection, null, ct);
            var restoredMigrations = await Migrations(connection, null, ct);
            if (!manifest.Tables.OrderBy(x => x.Key).SequenceEqual(tables.OrderBy(x => x.Key)) || !manifest.Migrations.SequenceEqual(restoredMigrations)) throw new BackupFailure("restored_schema_or_counts_mismatch");
            await using var constraints = new NpgsqlCommand("SELECT count(*) FROM pg_constraint WHERE NOT convalidated", connection);
            if ((long)(await constraints.ExecuteScalarAsync(ct))! != 0) throw new BackupFailure("restored_constraint_invalid");
            return manifest;
        }
        finally { Directory.Delete(work, true); }
    }
}
