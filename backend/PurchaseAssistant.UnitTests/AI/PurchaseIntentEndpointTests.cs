using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Microsoft.AspNetCore.DataProtection;
using PurchaseAssistant.Application.DTOs.Purchase;
using PurchaseAssistant.Application.Interfaces;

namespace PurchaseAssistant.UnitTests.AI;

public partial class PurchaseIntentEndpointTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid BusinessId = Guid.NewGuid();
    private static readonly Guid SessionId = Guid.NewGuid();
    private static readonly Guid SessionTokenId = Guid.NewGuid();
    private const string Key = "test-only-signing-key-at-least-thirty-two-bytes";
    private sealed class Factory : WebApplicationFactory<Program>
    {
        public string Permission { get; set; } = "purchase.create";
        public Role MemberRole { get; set; } = Role.Staff;
        public string BackupDirectory { get; set; } = Path.Combine(Path.GetTempPath(), "warehouse-backup-tests", Guid.NewGuid().ToString("N"));
        public Mock<IPurchaseParsingService> Parser { get; } = new();
        public Mock<IPurchaseService> Purchases { get; } = new();
        public Mock<IGlobalSearchService> Search { get; } = new();
        public Mock<IReportService> Reports { get; } = new();
        public bool RealCsvReports { get; set; }
        public bool DatabaseOperator { get; set; }
        public bool RecoveryOperator { get; set; }
        public PurchaseAssistant.Infrastructure.Services.Backups.IDatabaseBackupEngine? DatabaseBackupEngine { get; set; }
        public bool RealDashboard { get; set; }
        public Mock<IDashboardService> Dashboard { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("Jwt:SecretKey", Key);
            builder.UseSetting("BACKUP_DIR", BackupDirectory);
            builder.UseSetting("Backup:LockNamespace", BackupDirectory);
            if (DatabaseOperator) builder.UseSetting("Backup:OperatorUserIds:0", UserId.ToString());
            if (RecoveryOperator) builder.UseSetting("Backup:RecoveryOperatorUserIds:0", UserId.ToString());
            builder.UseSetting("ML:ArtifactPath", Path.Combine(BackupDirectory, "models"));
            builder.ConfigureServices(services => {
                if (DatabaseBackupEngine != null) { services.RemoveAll<PurchaseAssistant.Infrastructure.Services.Backups.IDatabaseBackupEngine>(); services.AddSingleton(DatabaseBackupEngine); }
                services.RemoveAll<IPurchaseParsingService>(); services.AddSingleton(Parser.Object);
                services.RemoveAll<IPurchaseService>(); services.AddSingleton(Purchases.Object);
                services.RemoveAll<IGlobalSearchService>(); services.AddSingleton(Search.Object);
                services.RemoveAll<IReportService>();
                if (RealCsvReports) services.AddScoped<IReportService, PurchaseAssistant.Infrastructure.Services.ReportService>();
                else services.AddSingleton(Reports.Object);
                services.RemoveAll<IDashboardService>();
                if (RealDashboard) services.AddScoped<IDashboardService, PurchaseAssistant.Infrastructure.Services.DashboardService>();
                else services.AddSingleton(Dashboard.Object);
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
                services.AddDataProtection().UseEphemeralDataProtectionProvider();
                // Keep one shared in-memory store for this host.
                var storeName = Guid.NewGuid().ToString();
                services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(storeName)
                    .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning)));
                using var provider = services.BuildServiceProvider(); using var scope = provider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.Businesses.Add(new Business { Id = BusinessId, Name = "Endpoint business", IsActive = true });
                db.Users.Add(new User { Id = UserId, Name = "Endpoint user", Email = "endpoint@test.local", Status = UserStatus.Active });
                db.Memberships.Add(new Membership { UserId = UserId, BusinessId = BusinessId, Role = MemberRole,
                    PermissionsJson = System.Text.Json.JsonSerializer.Serialize(new[] { Permission }) });
                db.RefreshTokens.Add(new RefreshToken { Id = SessionTokenId, UserId = UserId, FamilyId = SessionId, TokenHash = "fixture-only", TokenDigest = new string('0', 64), ExpiresAt = DateTime.UtcNow.AddDays(1) });
                db.SaveChanges();
            });
        }
        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "warehouse-backup-tests")) + Path.DirectorySeparatorChar;
            string directory; try { directory = Path.GetFullPath(BackupDirectory); } catch (ArgumentException) { return; }
            if (disposing && directory.StartsWith(root, StringComparison.OrdinalIgnoreCase) && Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }
    private static string Token(string permission, bool business, Guid? sessionId = null, bool sessionClaim = true)
    {
        var claims = new List<Claim> { new("permissions", permission), new(ClaimTypes.NameIdentifier, UserId.ToString()) };
        if (sessionClaim) claims.Add(new("sessionId", (sessionId ?? SessionId).ToString()));
        if (business) claims.Add(new("businessId", BusinessId.ToString()));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("PurchaseAssistant", "PurchaseAssistantApp", claims,
            expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: new(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key)), SecurityAlgorithms.HmacSha256)));
    }
    public static IEnumerable<object[]> FinancialResponseRoles =>
        from role in new[] { Role.Owner, Role.Manager, Role.Staff }
        from path in new[] { "/api/v1/dashboard", "/api/v1/reports/spend", "/api/v1/reports/purchases-summary", "/api/v1/reports/stock-analytics", "/api/v1/reports/comparison" }
        select new object[] { role, path };

    [Fact]
    public async Task AuthenticationRateLimitRejectsExcessRequestsWithoutLeakingDetails()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        for (var i = 0; i < 30; i++)
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "rate@test.local" })).StatusCode);
        var rejected = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "rate@test.local" });
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.DoesNotContain("Exception", await rejected.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AiRateLimitStopsExcessProviderWork()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        factory.Parser.Setup(p => p.ParseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PurchaseIntentCandidateDto(IntentStatus.Success, null, null, null, [], null, null));
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/ai/purchase-intent/parse", new { prompt = "Buy rice" })).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/v1/ai/purchase-intent/parse", new { prompt = "Buy rice" })).StatusCode);
        factory.Parser.Verify(p => p.ParseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Exactly(10));
    }

    [Fact]
    public async Task ReadinessFailuresReturnOnlySafeStatusAndLivenessRemainsAvailable()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        var readiness = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, readiness.StatusCode);
        Assert.Equal("{\"status\":\"unavailable\"}", await readiness.Content.ReadAsStringAsync());
    }

    [Theory]
    [MemberData(nameof(FinancialResponseRoles))]
    public async Task ReportsAndDashboardProtectFinancialSchemasAcrossAllRoles(Role role, string path)
    {
        using var factory = new Factory { Permission = "reports.view", MemberRole = role };
        factory.Reports.Setup(s => s.GetSpendAnalyticsAsync(BusinessId, It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<string>()))
            .ReturnsAsync([new() { TotalSpend = 987, PurchaseCount = 2 }]);
        factory.Reports.Setup(s => s.GetPurchaseSummaryAsync(BusinessId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new PurchaseAssistant.Application.DTOs.Reports.PurchaseSummaryReportDto { BySupplier = [new() { Key = "Supplier", TotalSpend = 987, Count = 2 }] });
        factory.Reports.Setup(s => s.GetStockAnalyticsAsync(BusinessId))
            .ReturnsAsync(new PurchaseAssistant.Application.DTOs.Reports.StockAnalyticsDto { EstimatedInventoryValue = 987, TotalCatalogItems = 2 });
        factory.Reports.Setup(s => s.GetPeriodComparisonAsync(BusinessId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new PurchaseAssistant.Application.DTOs.Reports.PeriodComparisonDto { CurrentPeriodSpend = 987, CurrentPeriodOrders = 2, OrdersChangePercentage = 25 });
        factory.Dashboard.Setup(s => s.GetDashboardDataAsync())
            .ReturnsAsync(new PurchaseAssistant.Application.DTOs.Dashboard.DashboardDto { PurchaseMetrics = new() { TotalPurchaseSpend = 987, ActivePurchasesCount = 2 },
                RecentPurchases = [new() { GrandTotal = 987, Items = [new() { UnitPrice = 987, OrderedQuantity = 4 }] }] });
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("reports.view", true));
        var response = await client.GetAsync(path); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(role == Role.Owner, body.Contains("987"));
        Assert.Contains("2", body);
        if (path.EndsWith("comparison")) Assert.Contains("\"ordersChangePercentage\":25", body);
        if (path.EndsWith("dashboard")) Assert.Contains("\"orderedQuantity\":4", body);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AccessTokensRequireAnExistingSessionFamily(bool missingClaim)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true, Guid.NewGuid(), !missingClaim));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RevokedOrExpiredSessionImmediatelyRejectsExistingAccessToken(bool expired)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var session = await db.RefreshTokens.SingleAsync();
            if (expired) session.ExpiresAt = DateTime.UtcNow.AddMinutes(-1); else session.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("logout")]
    [InlineData("logout-all")]
    public async Task LogoutInvalidatesAccessImmediatelyWithoutDependingOnCookie(string action)
    {
        using var factory = new Factory(); using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/v1/auth/{action}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task RotationPreservesAccessFamilyAndVerifiedReplayRevokesOnlyThatFamily()
    {
        using var factory = new Factory(); using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        var otherFamily = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            var session = await db.RefreshTokens.SingleAsync(); session.TokenHash = hasher.HashPassword("rotation-original");
            session.TokenDigest = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes("rotation-original")));
            db.RefreshTokens.Add(new RefreshToken { UserId = UserId, FamilyId = otherFamily, TokenHash = "other-session", TokenDigest = new string('1', 64), ExpiresAt = DateTime.UtcNow.AddDays(1) });
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        client.DefaultRequestHeaders.Add("Cookie", $"refreshToken={UserId}:rotation-original:{BusinessId}");
        var rotated = await client.PostAsync("/api/v1/auth/refresh", null); Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var data = System.Text.Json.JsonDocument.Parse(await rotated.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
        var newToken = data.GetProperty("accessToken").GetString()!;
        Assert.Equal(SessionId.ToString(), new JwtSecurityTokenHandler().ReadJwtToken(newToken).Claims.Single(c => c.Type == "sessionId").Value);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/auth/refresh", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true, otherFamily));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        using var verification = factory.Services.CreateScope();
        var dbCheck = verification.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await dbCheck.RefreshTokens.AnyAsync(t => t.FamilyId == otherFamily && t.RevokedAt == null));
        Assert.False(await dbCheck.RefreshTokens.AnyAsync(t => t.FamilyId == SessionId && t.RevokedAt == null));
    }

    [Theory]
    [InlineData("catalog.view", 0, 0)]
    [InlineData("catalog.view,supplier.view", 1, 0)]
    [InlineData("catalog.view,supplier.view,broker.view", 1, 1)]
    public async Task SearchHonorsEachContactDomainPermission(string permissions, int suppliers, int brokers)
    {
        using var factory = new Factory();
        factory.Search.Setup(s => s.SearchAsync("rice", It.IsAny<CancellationToken>())).ReturnsAsync(new PurchaseAssistant.Application.DTOs.Catalog.GlobalSearchResponseDto {
            Suppliers = [new() { Name = "Protected supplier" }], Brokers = [new() { Name = "Protected broker" }] });
        using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var membership = await db.Memberships.SingleAsync();
            membership.PermissionsJson = System.Text.Json.JsonSerializer.Serialize(permissions.Split(',')); await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("supplier.view", true));
        var response = await client.GetAsync("/api/v1/catalog/search?q=rice"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(suppliers, body.GetProperty("suppliers").GetArrayLength()); Assert.Equal(brokers, body.GetProperty("brokers").GetArrayLength());
    }

    [Theory]
    [InlineData("catalog.create", true, 201)]
    [InlineData("catalog.view", true, 403)]
    [InlineData("catalog.create", false, 401)]
    public async Task VariantCreateEnforcesServerPermission(string permission, bool authenticated, int expected)
    {
        using var factory = new Factory { Permission = permission }; using var client = factory.CreateClient();
        var itemId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var category = new Category { BusinessId = BusinessId, Name = "Variants" };
            db.AddRange(category, new CatalogItem { Id = itemId, BusinessId = BusinessId, CategoryId = category.Id, Name = "Rice", ItemCode = "V1" });
            await db.SaveChangesAsync();
        }
        if (authenticated) client.DefaultRequestHeaders.Authorization = new("Bearer", Token("catalog.create", true));
        var result = await client.PostAsJsonAsync($"/api/v1/catalog/items/{itemId}/variants", new { name = "Bag", kgPerUnit = 25 });
        Assert.Equal((HttpStatusCode)expected, result.StatusCode);
        using var checkScope = factory.Services.CreateScope();
        Assert.Equal(expected == 201 ? 1 : 0, await checkScope.ServiceProvider.GetRequiredService<AppDbContext>().CatalogVariants.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task VariantHttpCrudConflictTenantAndOwnerDeleteAreEnforced()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient();
        var itemId = Guid.NewGuid(); var foreignId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var category = new Category { BusinessId = BusinessId, Name = "Variants" };
            db.AddRange(category, new CatalogItem { Id = itemId, BusinessId = BusinessId, CategoryId = category.Id, Name = "Rice", ItemCode = "V1" },
                new CatalogItem { Id = foreignId, BusinessId = Guid.NewGuid(), CategoryId = category.Id, Name = "Foreign", ItemCode = "FOREIGN" });
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("catalog.create", true));
        var url = $"/api/v1/catalog/items/{itemId}/variants";
        var created = await client.PostAsJsonAsync(url, new { name = "Bag", kgPerUnit = 25 }); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var variant = await created.Content.ReadFromJsonAsync<PurchaseAssistant.Application.DTOs.Catalog.VariantDto>();
        Assert.NotNull(variant);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(url, new { name = " bag " })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/v1/catalog/items/{foreignId}/variants", new { name = "Bag" })).StatusCode);
        var edited = await client.PutAsJsonAsync($"{url}/{variant.Id}", new { name = "Box", rowVersion = variant.RowVersion, kgPerUnit = 10 });
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        var fresh = await edited.Content.ReadFromJsonAsync<PurchaseAssistant.Application.DTOs.Catalog.VariantDto>(); Assert.NotNull(fresh);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"{url}/{variant.Id}", variant)).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var membership = await db.Memberships.SingleAsync();
            membership.Role = Role.Manager; membership.PermissionsJson = "[\"catalog.archive\"]"; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"{url}/{variant.Id}?expectedVersion={fresh.RowVersion}")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var membership = await db.Memberships.SingleAsync();
            membership.Role = Role.Owner; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"{url}/{variant.Id}?expectedVersion={variant.RowVersion}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{url}/{variant.Id}?expectedVersion={fresh.RowVersion}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{url}/{variant.Id}?expectedVersion={fresh.RowVersion}")).StatusCode);
    }

    [Fact]
    public async Task UnconfiguredProductionCorsDoesNotTrustArbitraryLocalhostOrigins()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:8888");
        var response = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "endpoint@test.local" });
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Theory]
    [InlineData("/api/v1/dashboard")]
    [InlineData("/api/v1/notifications")]
    public async Task OperationalEndpointsRequireASelectedBusiness(string endpoint)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", false));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(endpoint)).StatusCode);
    }

    [Theory]
    [InlineData("", 400)]
    [InlineData("forged-token", 503)]
    public async Task PasswordResetCannotChangeAnAccountWithoutAVerifiedToken(string token, int expectedStatus)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        var refreshId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync(); user.PasswordHash = "unchanged-original-hash";
            db.RefreshTokens.Add(new RefreshToken { Id = refreshId, UserId = UserId, TokenHash = "original-token-hash", ExpiresAt = DateTime.UtcNow.AddDays(1) });
            await db.SaveChangesAsync();
        }
        var result = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new { email = "endpoint@test.local", newPassword = "attacker-password", token });
        Assert.Equal((HttpStatusCode)expectedStatus, result.StatusCode);
        using var verificationScope = factory.Services.CreateScope();
        var verification = verificationScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("unchanged-original-hash", (await verification.Users.SingleAsync()).PasswordHash);
        Assert.Null((await verification.RefreshTokens.SingleAsync(t => t.Id == refreshId)).RevokedAt);
    }

    [Fact]
    public async Task UnconfiguredPasswordRecoveryDoesNotEnumerateAccountsOrClaimDelivery()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        var known = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "endpoint@test.local" });
        var unknown = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "missing@test.local" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, known.StatusCode);
        Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.DoesNotContain("have been sent", await known.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(null, true, 401)]
    [InlineData("catalog.view", true, 403)]
    [InlineData("purchase.create", false, 403)]
    [InlineData("purchase.create", true, 200)]
    public async Task Parse_RequiresAuthenticationPermissionAndBusiness(string? permission, bool business, int status)
    {
        using var factory = new Factory { Permission = permission ?? "" };
        factory.Parser.Setup(p => p.ParseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PurchaseIntentCandidateDto(IntentStatus.Success, null, null, null, new(), null, null));
        using var client = factory.CreateClient();
        if (permission != null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(permission, business));
        var result = await client.PostAsJsonAsync("/api/v1/ai/purchase-intent/parse", new { prompt = "Buy rice", businessId = Guid.NewGuid() });
        Assert.Equal((HttpStatusCode)status, result.StatusCode);
        factory.Parser.Verify(p => p.ParseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), status == 200 ? Times.Once() : Times.Never());
    }
    [Fact]
    public async Task UnexpectedErrors_DoNotExposeInternalDetails()
    {
        using var factory = new Factory();
        factory.Parser.Setup(p => p.ParseAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ThrowsAsync(new Exception("secret-test-marker"));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        var result = await client.PostAsJsonAsync("/api/v1/ai/purchase-intent/parse", new { prompt = "Buy rice" });
        Assert.Equal(HttpStatusCode.InternalServerError, result.StatusCode);
        Assert.DoesNotContain("secret-test-marker", await result.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("purchase.view", PurchaseStatus.Verified, 403)]
    [InlineData("purchase.verify", PurchaseStatus.Verified, 403)]
    [InlineData("purchase.view,purchase.verify", PurchaseStatus.Verified, 200)]
    [InlineData("purchase.view,purchase.edit", PurchaseStatus.Dispatched, 403)]
    [InlineData("purchase.view,purchase.delivery", PurchaseStatus.Dispatched, 200)]
    public async Task LifecycleActionsRequireTheirOwnServerPermissions(string permissions, PurchaseStatus status, int expected)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await db.Memberships.SingleAsync();
            membership.PermissionsJson = System.Text.Json.JsonSerializer.Serialize(permissions.Split(','));
            await db.SaveChangesAsync();
        }
        factory.Purchases.Setup(p => p.UpdateStatusAsync(It.IsAny<Guid>(), status, 1)).ReturnsAsync(new PurchaseOrderDto());
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.edit", true));
        var result = await client.PostAsJsonAsync($"/api/v1/purchases/{Guid.NewGuid()}/status", new { status, expectedVersion = 1 });
        Assert.Equal((HttpStatusCode)expected, result.StatusCode);
        factory.Purchases.Verify(p => p.UpdateStatusAsync(It.IsAny<Guid>(), status, 1), expected == 200 ? Times.Once() : Times.Never());
    }

    [Theory]
    [InlineData(Role.Owner, true)]
    [InlineData(Role.SuperAdmin, true)]
    [InlineData(Role.Manager, false)]
    [InlineData(Role.Staff, false)]
    public async Task PurchaseHttpResponseExposesMoneyOnlyToOwnerOrScopedSuperAdmin(Role role, bool visible)
    {
        using var factory = new Factory { Permission = "purchase.view", MemberRole = role };
        factory.Purchases.Setup(p => p.GetPurchaseOrderByIdAsync(It.IsAny<Guid>())).ReturnsAsync(new PurchaseOrderDto
        { GrandTotal = 987m, Items = [new PurchaseItemDto { UnitPrice = 123m, OrderedQuantity = 4 }] });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        var result = await client.GetAsync($"/api/v1/purchases/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var body = System.Text.Json.JsonDocument.Parse(await result.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(visible, body.TryGetProperty("grandTotal", out _));
        Assert.Equal(visible, body.TryGetProperty("paidAmount", out _));
        Assert.Equal(visible, body.TryGetProperty("remainingAmount", out _));
        Assert.Equal(visible, body.GetProperty("items")[0].TryGetProperty("unitPrice", out _));
        Assert.Equal(4, body.GetProperty("items")[0].GetProperty("orderedQuantity").GetDecimal());
    }

    [Fact]
    public async Task RemovedMembershipReturnsUnauthorizedAtHttpBoundary()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Memberships.RemoveRange(db.Memberships); await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        var result = await client.PostAsJsonAsync("/api/v1/ai/purchase-intent/parse", new { prompt = "Buy rice" });
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
        factory.Parser.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData(Role.Owner, true, 200)]
    [InlineData(Role.Manager, true, 403)]
    [InlineData(Role.Staff, true, 403)]
    [InlineData(Role.Owner, false, 401)]
    public async Task OnlyOwnerCanRecordPaymentAtHttpBoundary(Role role, bool authenticated, int expected)
    {
        using var factory = new Factory { MemberRole = role, Permission = "purchase.edit" };
        factory.Purchases.Setup(p => p.UpdatePaymentAsync(It.IsAny<Guid>(), It.IsAny<UpdatePurchasePaymentDto>())).ReturnsAsync(new PurchaseOrderDto { PaidAmount = 10, RemainingAmount = 30 });
        using var client = factory.CreateClient();
        if (authenticated) client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.edit", true));
        var result = await client.PatchAsJsonAsync($"/api/v1/purchases/{Guid.NewGuid()}/payment", new { paidAmount = 10, expectedVersion = 1 });
        Assert.Equal((HttpStatusCode)expected, result.StatusCode);
        factory.Purchases.Verify(p => p.UpdatePaymentAsync(It.IsAny<Guid>(), It.IsAny<UpdatePurchasePaymentDto>()), expected == 200 ? Times.Once() : Times.Never());
    }

    [Fact]
    public async Task PaymentHttpRequiresExpectedVersionBeforeCallingService()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.edit", true));
        var result = await client.PatchAsJsonAsync($"/api/v1/purchases/{Guid.NewGuid()}/payment", new { paidAmount = 10 });
        Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode);
        factory.Purchases.Verify(p => p.UpdatePaymentAsync(It.IsAny<Guid>(), It.IsAny<UpdatePurchasePaymentDto>()), Times.Never());
    }

    [Fact]
    public async Task RandomRefreshCookieCannotRevokeVictimSessions()
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        Guid tokenId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            var token = new RefreshToken { UserId = UserId, TokenHash = hasher.HashPassword("real-refresh"), ExpiresAt = DateTime.UtcNow.AddDays(1) };
            tokenId = token.Id; db.RefreshTokens.Add(token); await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Add("Cookie", $"refreshToken={UserId}:attacker-garbage");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/auth/refresh", null)).StatusCode);
        using var checkScope = factory.Services.CreateScope();
        Assert.Null((await checkScope.ServiceProvider.GetRequiredService<AppDbContext>().RefreshTokens.SingleAsync(t => t.Id == tokenId)).RevokedAt);
    }

    [Fact]
    public async Task RefreshKeepsSelectedBusinessAndRotatesToken()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        var selected = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            db.Businesses.Add(new Business { Id = selected, Name = "Selected", IsActive = true });
            db.Memberships.Add(new Membership { BusinessId = selected, UserId = UserId, Role = Role.Manager, PermissionsJson = "[]" });
            db.RefreshTokens.Add(new RefreshToken { UserId = UserId, TokenHash = hasher.HashPassword("real-refresh"), ExpiresAt = DateTime.UtcNow.AddDays(1) });
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Add("Cookie", $"refreshToken={UserId}:real-refresh:{selected}");
        var result = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var body = System.Text.Json.JsonDocument.Parse(await result.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(selected.ToString(), body.GetProperty("data").GetProperty("user").GetProperty("currentBusiness").GetProperty("businessId").GetString());
        using var checkScope = factory.Services.CreateScope();
        var dbCheck = checkScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await dbCheck.RefreshTokens.CountAsync(t => t.Id != SessionTokenId && t.RevokedAt == null));
        Assert.Equal(1, await dbCheck.RefreshTokens.CountAsync(t => t.Id != SessionTokenId && t.RevokedAt != null));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LogoutRevokesBothLegacyAndSelectedBusinessRefreshCookies(bool selectedCookie)
    {
        using var factory = new Factory(); using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        Guid tokenId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            var refresh = new RefreshToken { UserId = UserId, FamilyId = SessionId, TokenHash = hasher.HashPassword("logout-refresh"), ExpiresAt = DateTime.UtcNow.AddDays(1) };
            tokenId = refresh.Id; db.RefreshTokens.Add(refresh); await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        client.DefaultRequestHeaders.Add("Cookie", $"refreshToken={UserId}:logout-refresh{(selectedCookie ? $":{BusinessId}" : "")}");
        var result = await client.PostAsync("/api/v1/auth/logout", null); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Contains(result.Headers.GetValues("Set-Cookie"), c => c.StartsWith("refreshToken=;"));
        using var check = factory.Services.CreateScope(); Assert.NotNull((await check.ServiceProvider.GetRequiredService<AppDbContext>().RefreshTokens.SingleAsync(t => t.Id == tokenId)).RevokedAt);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/auth/refresh", null)).StatusCode);
    }

    [Fact]
    public async Task LogoutCannotRevokeDifferentUsersRefreshSession()
    {
        using var factory = new Factory(); using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        var otherUserId = Guid.NewGuid(); Guid tokenId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            db.Users.Add(new User { Id = otherUserId, Name = "Other", Email = "logout-other@example.test", Status = UserStatus.Active });
            var refresh = new RefreshToken { UserId = otherUserId, TokenHash = hasher.HashPassword("different-user-refresh"), ExpiresAt = DateTime.UtcNow.AddDays(1) };
            tokenId = refresh.Id; db.RefreshTokens.Add(refresh); await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.view", true));
        client.DefaultRequestHeaders.Add("Cookie", $"refreshToken={otherUserId}:different-user-refresh:{BusinessId}");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/v1/auth/logout", null)).StatusCode);
        using var check = factory.Services.CreateScope(); Assert.Null((await check.ServiceProvider.GetRequiredService<AppDbContext>().RefreshTokens.SingleAsync(t => t.Id == tokenId)).RevokedAt);
    }

    [Fact]
    public async Task PurchaseHttpRequiresUnchangedNonexpiredPreviewBeforeSave()
    {
        using var factory = new Factory { MemberRole = Role.Owner };
        factory.Purchases.Setup(p => p.PreviewAsync(It.IsAny<UpsertPurchaseOrderDto>())).ReturnsAsync(new PurchasePreviewDto { GrandTotal = 40 });
        factory.Purchases.Setup(p => p.CreatePurchaseOrderAsync(It.IsAny<UpsertPurchaseOrderDto>())).ReturnsAsync(new PurchaseOrderDto { Id = Guid.NewGuid(), Status = PurchaseAssistant.Domain.Enums.PurchaseStatus.Draft, GrandTotal = 40 });
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("purchase.create", true));
        var input = new UpsertPurchaseOrderDto { SupplierId = Guid.NewGuid(), Items = [new() { CatalogItemId = Guid.NewGuid(), OrderedQuantity = 10, UnitPrice = 4 }] };
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/purchases", input)).StatusCode);
        factory.Purchases.Verify(p => p.CreatePurchaseOrderAsync(It.IsAny<UpsertPurchaseOrderDto>()), Times.Never());
        var previewResponse = await client.PostAsJsonAsync("/api/v1/purchases/preview", input);
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        var preview = await previewResponse.Content.ReadFromJsonAsync<PurchasePreviewDto>();
        Assert.NotNull(preview); input.PreviewToken = preview!.PreviewToken;
        input.Items[0].OrderedQuantity = 11;
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/purchases", input)).StatusCode);
        input.Items[0].OrderedQuantity = 10;
        var protector = factory.Services.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("PurchasePreview", BusinessId.ToString(), UserId.ToString()).ToTimeLimitedDataProtector();
        var hash = protector.Unprotect(input.PreviewToken, out _);
        input.PreviewToken = protector.Protect(hash, DateTimeOffset.UtcNow.AddMinutes(-1));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/purchases", input)).StatusCode);
        input.PreviewToken = preview.PreviewToken;
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/purchases", input)).StatusCode);
        factory.Purchases.Verify(p => p.CreatePurchaseOrderAsync(It.IsAny<UpsertPurchaseOrderDto>()), Times.Once());
    }
}
