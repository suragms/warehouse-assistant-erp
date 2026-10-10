using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;

namespace PurchaseAssistant.Web.Services;

public class PasswordRecoveryService(AppDbContext db, IPasswordHasher hasher, IDataProtectionProvider protection,
    IRecoveryMailSender sender, TimeProvider clock)
{
    private IDataProtector Protector => protection.CreateProtector("PasswordRecovery.Outbox.v1");
    public bool Available => sender.Available;
    public static string Digest(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public async Task RequestAsync(string email, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var normalized = email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email.ToLower() == normalized && x.Status == UserStatus.Active, ct);
        if (user == null) return;
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        if (transaction != null) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Users\" WHERE \"Id\" = {user.Id} FOR UPDATE", ct);
        // A durable per-recipient bound supplements the anonymous IP limiter.
        if (await db.Set<PasswordRecovery>().CountAsync(x => x.UserId == user.Id && x.CreatedAt > now.AddMinutes(-15), ct) >= 3) return;
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.Add(new PasswordRecovery { UserId = user.Id, Email = user.Email, TokenDigest = Digest(token), PasswordDigest = Digest(user.PasswordHash),
            ProtectedToken = Protector.Protect(token), CreatedAt = now, ExpiresAt = now.AddMinutes(30) });
        await db.SaveChangesAsync(ct);
        if (transaction != null) await transaction.CommitAsync(ct);
    }

    public async Task<bool> ResetAsync(string email, string token, string password, CancellationToken ct)
    {
        if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c))) return false;
        if (password.Length < 8 || Encoding.UTF8.GetByteCount(password) > 72 || string.IsNullOrWhiteSpace(password))
            throw new ArgumentException("Use at least 8 characters and at most 72 UTF-8 bytes.");
        var now = clock.GetUtcNow().UtcDateTime;
        var digest = Digest(token);
        var row = await db.Set<PasswordRecovery>().SingleOrDefaultAsync(x => x.TokenDigest == digest, ct);
        if (row == null || row.ConsumedAt != null || row.ExpiresAt <= now || !string.Equals(row.Email, email.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
        var normalized = email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == row.UserId && x.Email.ToLower() == normalized && x.Status == UserStatus.Active, ct);
        if (user == null || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(row.PasswordDigest), Encoding.ASCII.GetBytes(Digest(user.PasswordHash)))) return false;
        user.PasswordHash = hasher.HashPassword(password);
        row.ConsumedAt = now; row.ProtectedToken = "";
        foreach (var session in await db.RefreshTokens.Where(x => x.UserId == user.Id && x.RevokedAt == null).ToListAsync(ct)) session.RevokedAt = now;
        db.SecurityAuditLogs.Add(new() { UserId = user.Id, BusinessId = Guid.Empty, EventType = "PASSWORD_RESET", Description = "Password recovered; all existing sessions revoked." });
        // PasswordHash and ConsumedAt concurrency guards prevent two tokens winning together.
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); return false; }
    }

    public async Task DispatchAsync(CancellationToken ct)
    {
        if (!Available) return;
        var now = clock.GetUtcNow().UtcDateTime;
        // Purge token material promptly; retain bounded delivery metadata for seven days.
        await db.Set<PasswordRecovery>().Where(x => x.ExpiresAt <= now && x.ProtectedToken != "").ExecuteUpdateAsync(s => s.SetProperty(x => x.ProtectedToken, ""), ct);
        await db.Set<PasswordRecovery>().Where(x => x.CreatedAt < now.AddDays(-7)).ExecuteDeleteAsync(ct);
        var ids = await db.Set<PasswordRecovery>().Where(x => x.ClaimedAt == null && x.ConsumedAt == null && x.ExpiresAt > now)
            .OrderBy(x => x.CreatedAt).Select(x => x.Id).Take(10).ToListAsync(ct);
        foreach (var id in ids)
        {
            // Atomic claim across application instances; ambiguous SMTP outcomes are never automatically resent.
            if (await db.Set<PasswordRecovery>().Where(x => x.Id == id && x.ClaimedAt == null && x.ConsumedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ClaimedAt, now).SetProperty(x => x.DeliveryStatus, "sending"), ct) != 1) continue;
            var row = await db.Set<PasswordRecovery>().AsNoTracking().SingleAsync(x => x.Id == id, ct);
            var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == row.UserId && x.Status == UserStatus.Active, ct);
            var status = "failed";
            try
            {
                if (user != null && row.ConsumedAt == null && row.ExpiresAt > clock.GetUtcNow().UtcDateTime
                    && user.Email == row.Email && Digest(user.PasswordHash) == row.PasswordDigest)
                {
                    await sender.SendAsync(user.Email, Protector.Unprotect(row.ProtectedToken), ct);
                    status = "accepted";
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception) { status = "unknown"; } // Never log credentials, message bodies or SMTP errors.
            await db.Set<PasswordRecovery>().Where(x => x.Id == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ProtectedToken, "").SetProperty(x => x.DeliveryStatus, status), ct);
        }
    }
}
