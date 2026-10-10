using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Web.Services;
using Xunit;

namespace PurchaseAssistant.UnitTests.Auth;
public class PasswordRecoveryTests
{
    private readonly IDataProtectionProvider protection = new EphemeralDataProtectionProvider();
    private readonly Mock<TimeProvider> clock = new();
    private readonly Mock<IPasswordHasher> hasher = new();
    private readonly Mock<IRecoveryMailSender> sender = new();
    private readonly DbContextOptions<AppDbContext> options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
    private PasswordRecoveryService Service(AppDbContext db) => new(db, hasher.Object, protection, sender.Object, clock.Object);
    public PasswordRecoveryTests()
    {
        clock.Setup(x => x.GetUtcNow()).Returns(new DateTimeOffset(2026, 10, 10, 12, 0, 0, TimeSpan.Zero));
        sender.SetupGet(x => x.Available).Returns(true);
        hasher.Setup(x => x.HashPassword(It.IsAny<string>())).Returns((string p) => "hashed-" + p);
    }
    private async Task<(User User, string Token)> Issue(AppDbContext db)
    {
        var user = new User { Email = "owner@example.test", PasswordHash = "old-hash" };
        db.Users.Add(user); db.RefreshTokens.Add(new() { UserId = user.Id, ExpiresAt = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync(); await Service(db).RequestAsync(user.Email, default);
        var row = await db.Set<PasswordRecovery>().SingleAsync();
        var token = protection.CreateProtector("PasswordRecovery.Outbox.v1").Unprotect(row.ProtectedToken);
        Assert.NotEqual(token, row.ProtectedToken); Assert.NotEqual(token, row.TokenDigest);
        sender.Verify(x => x.SendAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        return (user, token);
    }
    [Fact] public async Task ResetIsSingleUseRevokesSessionsAndInvalidatesOtherIssuedTokens()
    {
        await using var db = new AppDbContext(options); var (user, token) = await Issue(db);
        await Service(db).RequestAsync(user.Email, default);
        var second = (await db.Set<PasswordRecovery>().ToListAsync()).Last();
        var secondToken = protection.CreateProtector("PasswordRecovery.Outbox.v1").Unprotect(second.ProtectedToken);
        Assert.True(await Service(db).ResetAsync(user.Email, token, "new-password", default));
        Assert.False(await Service(db).ResetAsync(user.Email, token, "replayed-password", default));
        Assert.False(await Service(db).ResetAsync(user.Email, secondToken, "other-password", default));
        Assert.Equal("hashed-new-password", user.PasswordHash);
        Assert.All(await db.RefreshTokens.ToListAsync(), x => Assert.NotNull(x.RevokedAt));
        Assert.Single(await db.SecurityAuditLogs.IgnoreQueryFilters().Where(x => x.EventType == "PASSWORD_RESET").ToListAsync());
    }
    [Theory, InlineData("wrong-email"), InlineData("expired"), InlineData("inactive"), InlineData("changed-password"), InlineData("changed-email"), InlineData("tampered")]
    public async Task InvalidRecoveryCannotChangePassword(string variant)
    {
        await using var db = new AppDbContext(options); var (user, token) = await Issue(db); var email = user.Email;
        if (variant == "wrong-email") email = "foreign@example.test";
        if (variant == "expired") clock.Setup(x => x.GetUtcNow()).Returns(new DateTimeOffset(2026, 10, 10, 12, 30, 0, TimeSpan.Zero));
        if (variant == "inactive") user.Status = UserStatus.Blocked;
        if (variant == "changed-password") user.PasswordHash = "changed";
        if (variant == "changed-email") user.Email = "new@example.test";
        if (variant == "tampered") token = new string('A', 64);
        await db.SaveChangesAsync(); var before = user.PasswordHash;
        Assert.False(await Service(db).ResetAsync(email, token, "new-password", default)); Assert.Equal(before, user.PasswordHash);
    }
    [Fact] public async Task UnknownAccountsCreateNoMailAndRecipientFloodIsBounded()
    {
        await using var db = new AppDbContext(options); var (user, _) = await Issue(db);
        for (var i = 0; i < 10; i++) { await Service(db).RequestAsync("missing@example.test", default); await Service(db).RequestAsync(user.Email, default); }
        Assert.Equal(3, await db.Set<PasswordRecovery>().CountAsync());
    }
    [Fact] public async Task PasswordByteLimitIsEnforced()
    {
        await using var db = new AppDbContext(options); var (user, token) = await Issue(db);
        await Assert.ThrowsAsync<ArgumentException>(() => Service(db).ResetAsync(user.Email, token, new string('é', 37), default));
        Assert.Null((await db.Set<PasswordRecovery>().SingleAsync()).ConsumedAt);
    }
    [Theory, InlineData("Recovery:Smtp:Security", "None"), InlineData("Recovery:ResetPageUrl", "http://example.test/reset-password"),
        InlineData("Recovery:ResetPageUrl", "https://example.test/reset-password?token=x"), InlineData("Recovery:Smtp:Port", "0"), InlineData("Recovery:Smtp:From", "invalid"), InlineData("Recovery:Smtp:Password", "")]
    public void InsecureOrIncompleteSmtpConfigurationIsUnavailable(string key, string value)
    {
        var values = SmtpConfig(); values[key] = value;
        Assert.False(new RecoveryMailSender(new ConfigurationBuilder().AddInMemoryCollection(values).Build()).Available);
    }
    [Fact] public void SecureSmtpConfigurationIsEligibleButNotLiveVerified() => Assert.True(new RecoveryMailSender(new ConfigurationBuilder().AddInMemoryCollection(SmtpConfig()).Build()).Available);
    private static Dictionary<string, string?> SmtpConfig() => new() {
        ["Recovery:Enabled"] = "true", ["Recovery:Smtp:Host"] = "smtp.example.test", ["Recovery:Smtp:Port"] = "587", ["Recovery:Smtp:Security"] = "StartTls",
        ["Recovery:Smtp:From"] = "recovery@example.test", ["Recovery:Smtp:Username"] = "test", ["Recovery:Smtp:Password"] = "fixture-only",
        ["Recovery:ResetPageUrl"] = "https://example.test/reset-password"
    };
}
