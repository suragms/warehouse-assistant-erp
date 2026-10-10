using System.Collections.Concurrent;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Web.Services;

namespace PurchaseAssistant.IntegrationTests.Stock;
public partial class StockServiceIntegrationTests
{
    private sealed class RecoveryHasher : IPasswordHasher
    {
        public string HashPassword(string password) => "hashed-" + password;
        public bool VerifyPassword(string password, string hash) => hash == HashPassword(password);
    }
    private sealed class RecordingRecoverySender : IRecoveryMailSender
    {
        public bool Available => true;
        public ConcurrentBag<string> Tokens { get; } = [];
        public async Task SendAsync(string email, string token, CancellationToken ct) { Tokens.Add(token); await Task.Delay(30, ct); }
    }
    private AppDbContext RecoveryContext() => new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).Options, _tenant);
    [RequiresDisposablePostgresFact]
    public async Task RecoveryOutboxClaimsOnceAcrossWorkersAndResetRevokesAllSessions()
    {
        var user = await _context.Users.SingleAsync(x => x.Id == _userId); user.Status = UserStatus.Active;
        _context.RefreshTokens.Add(new() { UserId = user.Id, ExpiresAt = DateTime.UtcNow.AddDays(1) }); await _context.SaveChangesAsync();
        var protection = new EphemeralDataProtectionProvider(); var sender = new RecordingRecoverySender(); var hasher = new RecoveryHasher();
        var service = new PasswordRecoveryService(_context, hasher, protection, sender, TimeProvider.System);
        await service.RequestAsync(user.Email, default); await service.RequestAsync(user.Email, default);
        await using var a = RecoveryContext(); await using var b = RecoveryContext();
        await Task.WhenAll(new PasswordRecoveryService(a, hasher, protection, sender, TimeProvider.System).DispatchAsync(default),
            new PasswordRecoveryService(b, hasher, protection, sender, TimeProvider.System).DispatchAsync(default));
        Assert.Equal(2, sender.Tokens.Count); Assert.Equal(2, sender.Tokens.Distinct().Count());
        _context.ChangeTracker.Clear();
        Assert.All(await _context.Set<PasswordRecovery>().Where(x => x.UserId == _userId).ToListAsync(), row => { Assert.Equal("accepted", row.DeliveryStatus); Assert.Empty(row.ProtectedToken); });
        Assert.True(await service.ResetAsync(user.Email, sender.Tokens.First(), "new-password", default));
        Assert.False(await service.ResetAsync(user.Email, sender.Tokens.Last(), "another-password", default));
        Assert.All(await _context.RefreshTokens.Where(x => x.UserId == _userId).ToListAsync(), row => Assert.NotNull(row.RevokedAt));
        await _context.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"SecurityAuditLogs\" WHERE \"UserId\" = {_userId}");
    }
    [RequiresDisposablePostgresFact]
    public async Task ConcurrentRecoveryRequestsRespectDurableRecipientLimit()
    {
        var user = await _context.Users.SingleAsync(x => x.Id == _userId); user.Status = UserStatus.Active; await _context.SaveChangesAsync();
        var protection = new EphemeralDataProtectionProvider(); var sender = new RecordingRecoverySender();
        await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ => {
            await using var db = RecoveryContext(); await new PasswordRecoveryService(db, new RecoveryHasher(), protection, sender, TimeProvider.System).RequestAsync(user.Email, default);
        }));
        Assert.Equal(3, await _context.Set<PasswordRecovery>().CountAsync(x => x.UserId == _userId));
    }
    [RequiresDisposablePostgresFact]
    public async Task ConcurrentResetTokensCannotBothChangePassword()
    {
        var user = await _context.Users.SingleAsync(x => x.Id == _userId); user.Status = UserStatus.Active; await _context.SaveChangesAsync();
        var protection = new EphemeralDataProtectionProvider(); var sender = new RecordingRecoverySender(); var hasher = new RecoveryHasher();
        var service = new PasswordRecoveryService(_context, hasher, protection, sender, TimeProvider.System);
        await service.RequestAsync(user.Email, default); await service.RequestAsync(user.Email, default);
        var tokens = (await _context.Set<PasswordRecovery>().Where(x => x.UserId == _userId).ToListAsync())
            .Select(row => protection.CreateProtector("PasswordRecovery.Outbox.v1").Unprotect(row.ProtectedToken)).ToArray();
        await using var a = RecoveryContext(); await using var b = RecoveryContext();
        var results = await Task.WhenAll(new PasswordRecoveryService(a, hasher, protection, sender, TimeProvider.System).ResetAsync(user.Email, tokens[0], "first-password", default),
            new PasswordRecoveryService(b, hasher, protection, sender, TimeProvider.System).ResetAsync(user.Email, tokens[1], "second-password", default));
        Assert.Single(results, x => x);
        await _context.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM \"SecurityAuditLogs\" WHERE \"UserId\" = {_userId}");
    }
}
