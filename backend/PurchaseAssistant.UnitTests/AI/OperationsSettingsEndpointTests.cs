using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PurchaseAssistant.Application.DTOs.Operations;
using PurchaseAssistant.Application.DTOs.Settings;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Web.Services;

namespace PurchaseAssistant.UnitTests.AI;

public partial class PurchaseIntentEndpointTests
{
    [Theory]
    [InlineData("/operations/tasks")]
    [InlineData("/operations/snapshots")]
    [InlineData("/settings/profile")]
    [InlineData("/settings/credentials")]
    public async Task OperationsAndSettingsRequireAuthenticatedBusiness(string path)
    {
        using var factory = new Factory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1" + path)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", false));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1" + path)).StatusCode);
    }

    [Theory]
    [InlineData(Role.Manager)] [InlineData(Role.Staff)]
    public async Task NonownersCannotAssignTasksOrReadWriteCredentials(Role role)
    {
        using var factory = new Factory { MemberRole = role, Permission = "providers.manage" }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("providers.manage", true));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/settings/credentials")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/v1/settings/credentials/openai_key", new { value = "test-only-key" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/operations/tasks", new { staffId = UserId, taskType = "general" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/tasks/assignees")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/tasks/performance")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/owner-dashboard")).StatusCode);
    }

    [Theory]
    [InlineData(Role.Owner)] [InlineData(Role.Admin)]
    public async Task TaskAssignmentLifecycleRejectsStaleVersionsAndInvalidAssignees(Role role)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/operations/tasks", new { staffId = Guid.NewGuid(), taskType = "general" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/operations/tasks", new { staffId = UserId, taskType = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/operations/tasks?status=unknown")).StatusCode);
        var response = await client.PostAsJsonAsync("/api/v1/operations/tasks", new { staffId = UserId, taskType = "stock check", referenceId = "R1" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var task = (await response.Content.ReadFromJsonAsync<StaffTaskDto>())!;
        Assert.Equal("assigned", task.Status);
        var accepted = await client.PostAsJsonAsync($"/api/v1/operations/tasks/{task.Id}/accept", new { expectedVersion = task.Version });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode); var current = (await accepted.Content.ReadFromJsonAsync<StaffTaskDto>())!;
        Assert.Equal("accepted", current.Status); Assert.NotNull(current.AcceptedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/v1/operations/tasks/{task.Id}/complete", new { expectedVersion = task.Version })).StatusCode);
        var completed = await client.PostAsJsonAsync($"/api/v1/operations/tasks/{task.Id}/complete", new { expectedVersion = current.Version, rejected = true, correctionNote = "Needs correction" });
        var final = (await completed.Content.ReadFromJsonAsync<StaffTaskDto>())!;
        Assert.Equal("rejected", final.Status); Assert.Equal("Needs correction", final.CorrectionNote); Assert.NotNull(final.CompletedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/v1/operations/tasks/{task.Id}/accept", new { expectedVersion = final.Version })).StatusCode);
        var performance = (await client.GetFromJsonAsync<List<StaffPerformanceDto>>("/api/v1/operations/tasks/performance"))!;
        Assert.Equal(1, Assert.Single(performance).Rejected);
    }

    [Theory]
    [InlineData(Role.Manager, 2)] [InlineData(Role.Staff, 1)]
    public async Task TaskListsAreTenantScopedAndStaffCanActOnlyOnTheirOwnWork(Role role, int visible)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var otherId = Guid.NewGuid(); var otherTask = new StaffTask { BusinessId = BusinessId, StaffId = otherId, CreatedById = UserId };
        var foreign = new StaffTask { BusinessId = Guid.NewGuid(), StaffId = UserId, CreatedById = UserId };
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AddRange(new User { Id = otherId, Name = "Other", Email = "other@test.local" }, new Membership { BusinessId = BusinessId, UserId = otherId, Role = Role.Staff },
                new StaffTask { BusinessId = BusinessId, StaffId = UserId, CreatedById = UserId }, otherTask, foreign); await db.SaveChangesAsync();
        }
        var list = (await client.GetFromJsonAsync<List<StaffTaskDto>>("/api/v1/operations/tasks"))!; Assert.Equal(visible, list.Count);
        Assert.DoesNotContain(list, x => x.Id == foreign.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/operations/tasks/{otherTask.Id}/accept", new { expectedVersion = otherTask.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/v1/operations/tasks/{foreign.Id}/accept", new { expectedVersion = foreign.Version })).StatusCode);
        if (role == Role.Staff) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/operations/tasks?staffId={otherId}")).StatusCode);
    }

    [Theory]
    [InlineData(Role.Owner)] [InlineData(Role.Admin)]
    public async Task ProviderCredentialsAreEncryptedMaskedTenantScopedAndVersioned(Role role)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token("providers.manage", true));
        const string secret = "test-only-provider-secret-1234";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/settings/credentials/jwt_secret", new { value = secret })).StatusCode);
        var response = await client.PutAsJsonAsync("/api/v1/settings/credentials/openai_key", new { value = secret });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var saved = (await response.Content.ReadFromJsonAsync<CredentialStatusDto>())!;
        Assert.Equal("1234", saved.LastFour); Assert.DoesNotContain(secret, await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/v1/settings/credentials/openai_key", new { value = "replacement" })).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var row = await db.Set<ProviderCredential>().IgnoreQueryFilters().SingleAsync();
            Assert.DoesNotContain(secret, row.EncryptedValue); Assert.DoesNotContain(secret, (await db.SecurityAuditLogs.IgnoreQueryFilters().SingleAsync()).Description);
            db.Add(new ProviderCredential { BusinessId = Guid.NewGuid(), CredentialType = "groq_key", EncryptedValue = "foreign", UpdatedById = UserId }); await db.SaveChangesAsync();
        }
        var list = (await client.GetFromJsonAsync<List<CredentialStatusDto>>("/api/v1/settings/credentials"))!; Assert.Single(list);
        var shortSecret = await client.PutAsJsonAsync("/api/v1/settings/credentials/openai_key", new { value = "abcd", expectedVersion = saved.Version });
        Assert.Equal(HttpStatusCode.OK, shortSecret.StatusCode); Assert.DoesNotContain("abcd", await shortSecret.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData(Role.Owner)] [InlineData(Role.Manager)] [InlineData(Role.Staff)]
    public async Task PersonalProfileCannotChangeRolesOrAnotherUser(Role role)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        var response = await client.PutAsJsonAsync("/api/v1/settings/profile", new { name = " Updated name ", role = "Owner", id = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal("Updated name", (await response.Content.ReadFromJsonAsync<PersonalProfileDto>())!.Name);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/settings/profile", new { name = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/settings/profile", new { name = new string('x', 151) })).StatusCode);
        using var scope = factory.Services.CreateScope(); Assert.Equal(role, (await scope.ServiceProvider.GetRequiredService<AppDbContext>().Memberships.SingleAsync()).Role);
    }
    [Theory]
    [InlineData(Role.Owner)] [InlineData(Role.Admin)]
    public async Task OwnerCommandCenterUsesTenantDataAndProtectsFinancialFields(Role role)
    {
        using var factory = new Factory { MemberRole = role }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.view", true));
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AddRange(new CatalogItem { BusinessId = BusinessId, Name = "Local", CurrentStock = 0, ReorderLevel = 1 },
                new CatalogItem { BusinessId = Guid.NewGuid(), Name = "Foreign", CurrentStock = 0, ReorderLevel = 1 }); await db.SaveChangesAsync(); }
        var response = await client.GetAsync("/api/v1/operations/owner-dashboard"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, json.GetProperty("lowStockCount").GetInt32()); Assert.Equal(1, json.GetProperty("outOfStockCount").GetInt32());
        Assert.Equal(role is Role.Owner or Role.Admin, json.TryGetProperty("spendLast7Days", out _));
    }

    [Fact]
    public async Task UsageIsCumulativeVersionedAndSnapshotsNeverMutateStock()
    {
        using var factory = new Factory { MemberRole = Role.Owner }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("stock.adjust", true));
        var item = new CatalogItem { BusinessId = BusinessId, Name = "Rice", ItemCode = "R1", CurrentStock = 10, IsActive = true, RowVersion = Guid.NewGuid() };
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var category = new Category { BusinessId = BusinessId, Name = "Food" }; item.CategoryId = category.Id; db.AddRange(category, item); await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/v1/operations/snapshot/materialize", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/v1/operations/snapshot/materialize", null)).StatusCode);
        var snapshots = (await client.GetFromJsonAsync<List<DailyUsageSnapshotDto>>("/api/v1/operations/snapshots"))!; Assert.Single(snapshots); Assert.Equal(10, snapshots[0].ClosingQty);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/operations/snapshots?fromDate=2026-10-02&toDate=2026-10-01")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/operations/snapshots?itemId={Guid.NewGuid()}")).StatusCode);
        var first = await client.PostAsJsonAsync("/api/v1/operations/usage", new { lines = new[] { new { catalogItemId = item.Id, expectedVersion = item.RowVersion, quantityUsed = 3, notes = "Consumed" } } });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/operations/usage", new { lines = new[] { new { catalogItemId = item.Id, expectedVersion = item.RowVersion, quantityUsed = 4 } } })).StatusCode);
        var usage = (await client.GetFromJsonAsync<UsageTodayDto>("/api/v1/operations/usage/today"))!; var line = Assert.Single(usage.Lines); Assert.Equal(7, line.ClosingQty);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/operations/usage", new { lines = new[] { new { catalogItemId = item.Id, expectedVersion = line.ExpectedVersion, quantityUsed = 2 } } })).StatusCode);
        using var finalScope = factory.Services.CreateScope(); var finalDb = finalScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(8, (await finalDb.CatalogItems.IgnoreQueryFilters().SingleAsync()).CurrentStock); Assert.Equal(2, await finalDb.StockMovements.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task ManagerCanManageStaffButCannotEscalateOrDemotePrivilegedMembers()
    {
        using var factory = new Factory { MemberRole = Role.Manager, Permission = "users.manage" }; using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token("users.manage", true));
        var create = await client.PostAsJsonAsync("/api/v1/users", new { name = "Staff", email = "managed@test.local", password = "test-staff-password", role = 4 });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var json = System.Text.Json.JsonDocument.Parse(await create.Content.ReadAsStringAsync()).RootElement; var id = json.GetProperty("data").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/v1/users/{id}", new { name = "Updated Staff", email = "managed@test.local", role = 4, status = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/users", new { name = "Manager", email = "manager@test.local", password = "test-staff-password", role = 3 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/users/{id}", new { name = "Staff", email = "managed@test.local", role = 3, status = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PatchAsJsonAsync($"/api/v1/users/{id}/permissions", new { grant = new[] { "users.manage" }, revoke = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/users/{UserId}", new { name = "Demoted", email = "endpoint@test.local", role = 4, status = 0 })).StatusCode);
    }
}
