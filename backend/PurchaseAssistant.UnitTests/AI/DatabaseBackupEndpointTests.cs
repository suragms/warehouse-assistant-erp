using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services.Backups;
namespace PurchaseAssistant.UnitTests.AI;
public partial class PurchaseIntentEndpointTests
{
    private const string DatabaseBackups = "/api/v1/exports/database-backups";
    private static Mock<IDatabaseBackupEngine> BackupEngine()
    {
        var engine = new Mock<IDatabaseBackupEngine>(); engine.Setup(e => e.Health()).Returns(new BackupHealth(true, "Protected storage", "persistent", false, [])); return engine;
    }
    [Theory]
    [InlineData(Role.Owner, true)] [InlineData(Role.Admin, true)] [InlineData(Role.Manager, true)] [InlineData(Role.Staff, true)] [InlineData(Role.SuperAdmin, false)]
    public async Task FullDatabaseArchivesRequirePlatformRoleAndIndependentOperatorAllowlist(Role role, bool listed)
    {
        using var factory = new Factory { MemberRole = role, DatabaseOperator = listed, DatabaseBackupEngine = BackupEngine().Object }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(DatabaseBackups)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(DatabaseBackups, null)).StatusCode);
        var id = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(DatabaseBackups + $"/{id}/download")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(DatabaseBackups + $"/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(DatabaseBackups + $"/{id}/verify", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(DatabaseBackups + $"/{id}/recovery-preflight", new { confirmed = true })).StatusCode);
    }
    [Fact]
    public async Task FullDatabaseArchivesRejectAnonymousAndUnselectedBusinessSessions()
    {
        using var factory = new Factory { MemberRole = Role.SuperAdmin, DatabaseOperator = true, DatabaseBackupEngine = BackupEngine().Object }; using var client = factory.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(DatabaseBackups)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", false)); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(DatabaseBackups)).StatusCode);
    }
    [Fact]
    public async Task OperatorQueueIsAcceptedDeduplicatedAndIndependentOfInventory()
    {
        var engine = BackupEngine(); using var factory = new Factory { MemberRole = Role.SuperAdmin, DatabaseOperator = true, DatabaseBackupEngine = engine.Object }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(DatabaseBackups)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsync(DatabaseBackups, null)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync(DatabaseBackups, null)).StatusCode);
        engine.Verify(e => e.CreateAsync(It.IsAny<Guid>(), It.IsAny<Func<string, Task>>(), It.IsAny<CancellationToken>()), Times.Never);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); Assert.Single(db.DatabaseBackupJobs); Assert.Empty(db.StockMovements); Assert.Empty(db.Purchases); Assert.Contains(db.DatabaseBackupEvents, e => e.ActorId == UserId && e.Action == "manual_requested");
    }
    [Fact]
    public async Task RecoveryHasSeparateAuthorizationAndRequiresConfirmation()
    {
        foreach (var recovery in new[] { false, true })
        {
            using var factory = new Factory { MemberRole = Role.SuperAdmin, DatabaseOperator = true, RecoveryOperator = recovery, DatabaseBackupEngine = BackupEngine().Object }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
            var archive = new DatabaseBackupJob { Status = "succeeded", Sha256 = new string('A', 64), CreatedAt = DateTime.UtcNow, CompletedAt = DateTime.UtcNow, VerifiedAt = DateTime.UtcNow };
            using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Add(archive); db.Add(new DatabaseBackupJob { Kind = "verify", SourceId = archive.Id, Status = "succeeded", CreatedAt = DateTime.UtcNow, CompletedAt = DateTime.UtcNow }); await db.SaveChangesAsync(); }
            Assert.Equal(recovery ? HttpStatusCode.BadRequest : HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(DatabaseBackups + $"/{archive.Id}/recovery-preflight", new { confirmed = false })).StatusCode);
            var response = await client.PostAsJsonAsync(DatabaseBackups + $"/{archive.Id}/recovery-preflight", new { confirmed = true }); Assert.Equal(recovery ? HttpStatusCode.OK : HttpStatusCode.Forbidden, response.StatusCode);
            if (recovery) Assert.Contains("\"liveRestoreEnabled\":false", await response.Content.ReadAsStringAsync());
        }
    }
    [Fact]
    public async Task OperatorDownloadsOnlySuccessfulArchivesAndAuditsAccess()
    {
        var engine = BackupEngine(); engine.Setup(e => e.Open(It.IsAny<Guid>())).Returns(() => new MemoryStream("encrypted-fixture"u8.ToArray()));
        using var factory = new Factory { MemberRole = Role.SuperAdmin, DatabaseOperator = true, DatabaseBackupEngine = engine.Object }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var success = new DatabaseBackupJob { Status = "succeeded", Sha256 = new string('A', 64), CreatedAt = DateTime.UtcNow }; var failed = new DatabaseBackupJob { Status = "failed", CreatedAt = DateTime.UtcNow };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.AddRange(success, failed); await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(DatabaseBackups + $"/{failed.Id}/download")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(DatabaseBackups + $"/{Guid.NewGuid()}/download")).StatusCode);
        var result = await client.GetAsync(DatabaseBackups + $"/{success.Id}/download"); Assert.Equal(HttpStatusCode.OK, result.StatusCode); Assert.Equal("application/octet-stream", result.Content.Headers.ContentType!.MediaType);
        using var check = factory.Services.CreateScope(); Assert.Contains(check.ServiceProvider.GetRequiredService<AppDbContext>().DatabaseBackupEvents, e => e.Action == "downloaded" && e.ActorId == UserId);
    }
}
