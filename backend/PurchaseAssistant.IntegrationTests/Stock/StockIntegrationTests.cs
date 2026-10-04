using System;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Stock;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;
using Xunit;

namespace PurchaseAssistant.IntegrationTests.Stock
{
    /// <summary>
    /// PostgreSQL integration tests for Phase 4 Stock Engine.
    /// Covers transaction rollback, concurrency, and tenant isolation — behaviors InMemory cannot prove.
    /// Tests are isolated using per-test unique Business IDs and cleaned up after each run.
    /// </summary>
    public partial class StockServiceIntegrationTests : IAsyncLifetime
    {
        private static readonly string ConnectionString = DisposablePostgres.ConnectionString;

        private AppDbContext _context = null!;
        private StubTenant _tenant = null!;
        private StubUser _user = null!;

        private Guid _businessId;
        private Guid _userId;
        private Guid _categoryId;

        public async Task InitializeAsync()
        {
            _businessId = Guid.NewGuid();
            _userId = Guid.NewGuid();
            _categoryId = Guid.NewGuid();

            _tenant = new StubTenant(_businessId);
            _user = new StubUser(_businessId, _userId);

            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(ConnectionString)
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning))
                .Options;

            _context = new AppDbContext(options, _tenant);

            // Seed test business, user and category for this test run
            // Use raw SQL to bypass global query filters (they scope to BusinessId, which is fine)
            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Businesses\" (\"Id\", \"Name\", \"IsActive\", \"CreatedAt\") VALUES ({0}, {1}, true, NOW())",
                _businessId, $"IntegTest-{_businessId}");

            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Users\" (\"Id\", \"Name\", \"Email\", \"PasswordHash\", \"Status\", \"CreatedAt\") VALUES ({0}, 'Test User', {1}, 'hash', 1, NOW())",
                _userId, $"integ-{_userId}@test.com");

            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Categories\" (\"Id\", \"BusinessId\", \"Name\", \"CreatedAt\") VALUES ({0}, {1}, 'Test Category', NOW())",
                _categoryId, _businessId);
        }

        public async Task DisposeAsync()
        {
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"MlPredictionLogs\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"Notifications\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"UserSettings\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"SupplierItemPrices\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"SupplierItems\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"Memberships\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"RefreshTokens\" WHERE \"UserId\" = {0}", _userId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"PurchaseItems\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"Purchases\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"BackupLogs\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"AiUsageLogs\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"SecurityAuditLogs\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"ChecklistCompletion\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"DailyUsageLogs\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"HistoricalUsageRows\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"HistoricalUsageBatches\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"DailyOperationSnapshots\" WHERE \"BusinessId\" = {0}", _businessId);
            // Clean up in reverse FK order to avoid constraint errors
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM \"StockMovements\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM \"CatalogItems\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM \"Suppliers\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM \"Categories\" WHERE \"BusinessId\" = {0}", _businessId);
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM \"Users\" WHERE \"Id\" = {0}", _userId);
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM \"Businesses\" WHERE \"Id\" = {0}", _businessId);

            await _context.DisposeAsync();
        }

        private async Task<CatalogItem> CreateItemAsync(decimal current = 100, decimal reserved = 0, decimal physical = 100)
        {
            var item = new CatalogItem
            {
                Id = Guid.NewGuid(),
                BusinessId = _businessId,
                CategoryId = _categoryId,
                Name = $"IntegTestItem-{Guid.NewGuid()}",
                ItemCode = $"IT-{Guid.NewGuid().ToString("N")[..8].ToUpper()}",
                CurrentStock = current,
                ReservedStock = reserved,
                PhysicalStock = physical,
                RowVersion = Guid.NewGuid()
            };

            await _context.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ""CatalogItems""
                  (""Id"",""BusinessId"",""CategoryId"",""Name"",""ItemCode"",""CurrentStock"",""ReservedStock"",""PhysicalStock"",""ReorderLevel"",""RowVersion"",""DefaultUnit"",""IsActive"",""CreatedAt"")
                  VALUES ({0},{1},{2},{3},{4},{5},{6},{7},0,{8},'PCS',true,NOW())",
                item.Id, _businessId, _categoryId, item.Name, item.ItemCode,
                current, reserved, physical, item.RowVersion);

            // Reload to get tracked entity
            var tracked = await _context.CatalogItems.AsNoTracking()
                .IgnoreQueryFilters()
                .FirstAsync(i => i.Id == item.Id);
            return tracked;
        }

        // ── Test 1: Transaction Rollback ──────────────────────────────────────────
        [RequiresDisposablePostgresFact]
        public async Task Transaction_WhenExceptionOccursAfterStockUpdate_RollsBackBothStockAndMovement()
        {
            // Arrange
            var item = await CreateItemAsync(current: 100);
            var originalStock = item.CurrentStock;
            var originalVersion = item.RowVersion;

            // Act — Manually simulate what StockService does but force failure after stock update
            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                var tracked = await _context.CatalogItems.FindAsync(item.Id);
                tracked!.CurrentStock += 50;
                tracked.RowVersion = Guid.NewGuid();

                _context.StockMovements.Add(new StockMovement
                {
                    BusinessId = _businessId,
                    CatalogItemId = item.Id,
                    MovementType = "AdjustmentIncrease",
                    QuantityDelta = 50,
                    QuantityBefore = 100,
                    QuantityAfter = 150,
                    CreatedById = _userId,
                    CreatedAt = DateTime.UtcNow
                });

                await _context.SaveChangesAsync();

                // Force an exception before commit
                throw new Exception("Simulated failure after save, before commit");
            }
            catch
            {
                await tx.RollbackAsync();
            }

            // Assert — stock must be unchanged, movement must not exist
            _context.ChangeTracker.Clear(); // Detach all cached entities

            var stockAfter = await _context.CatalogItems
                .AsNoTracking()
                .IgnoreQueryFilters()
                .FirstAsync(i => i.Id == item.Id);

            stockAfter.CurrentStock.Should().Be(originalStock,
                "transaction rollback must restore original stock");

            var movements = await _context.StockMovements
                .AsNoTracking()
                .IgnoreQueryFilters()
                .Where(m => m.CatalogItemId == item.Id)
                .ToListAsync();

            movements.Should().BeEmpty(
                "no movement must persist after a rolled-back transaction");
        }

        // ── Test 2: Concurrency / Version Conflict ────────────────────────────────
        [RequiresDisposablePostgresFact]
        public async Task Concurrency_WhenTwoUsersUseStaleVersion_OnlyOneSucceeds()
        {
            // Arrange
            var item = await CreateItemAsync(current: 100);
            var originalVersion = item.RowVersion;

            var optionsA = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(ConnectionString)
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning))
                .Options;

            var optionsB = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(ConnectionString)
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning))
                .Options;

            await using var ctxA = new AppDbContext(optionsA, _tenant);
            await using var ctxB = new AppDbContext(optionsB, _tenant);

            var sutA = new StockService(ctxA, _user);
            var sutB = new StockService(ctxB, _user);

            // Act — User A adjusts successfully
            var reqA = new AdjustStockRequestDto { Reason = "Regression stock adjustment", QuantityDelta = 10, ExpectedVersion = originalVersion };
            var resultA = await sutA.AdjustStockAsync(item.Id, reqA);

            // User B uses the stale original version — must fail
            var reqB = new AdjustStockRequestDto { Reason = "Regression stock adjustment", QuantityDelta = -10, ExpectedVersion = originalVersion };
            var actB = async () => await sutB.AdjustStockAsync(item.Id, reqB);

            // Assert
            resultA.SystemStock.Should().Be(110m, "User A's +10 must have succeeded");

            await actB.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("STOCK_VERSION_CONFLICT");

            // Final stock should be exactly 110 (only A's change), not 100
            var final = await _context.CatalogItems
                .AsNoTracking()
                .IgnoreQueryFilters()
                .FirstAsync(i => i.Id == item.Id);
            final.CurrentStock.Should().Be(110m, "only one concurrent write must win");

            // Exactly one movement: User A's
            var movements = await _context.StockMovements
                .AsNoTracking()
                .IgnoreQueryFilters()
                .Where(m => m.CatalogItemId == item.Id)
                .ToListAsync();
            movements.Should().HaveCount(1, "only one movement must exist for the successful operation");
            movements[0].QuantityDelta.Should().Be(10m);
        }

        // ── Test 3: Tenant Isolation ──────────────────────────────────────────────
        [RequiresDisposablePostgresFact]
        public async Task TenantIsolation_BusinessA_CannotAccessBusinessBItems()
        {
            // Arrange — create a separate Business B with its own item
            var businessBId = Guid.NewGuid();
            var businessBCatId = Guid.NewGuid();
            var businessBUserId = Guid.NewGuid();

            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Businesses\" (\"Id\",\"Name\",\"IsActive\",\"CreatedAt\") VALUES ({0},{1},true,NOW())",
                businessBId, $"BusinessB-{businessBId}");
            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Users\" (\"Id\",\"Name\",\"Email\",\"PasswordHash\",\"Status\",\"CreatedAt\") VALUES ({0},'UserB',{1},'hash',1,NOW())",
                businessBUserId, $"userb-{businessBUserId}@test.com");
            await _context.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"Categories\" (\"Id\",\"BusinessId\",\"Name\",\"CreatedAt\") VALUES ({0},{1},'Cat B',NOW())",
                businessBCatId, businessBId);

            var businessBItemId = Guid.NewGuid();
            var businessBItemVersion = Guid.NewGuid();
            await _context.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ""CatalogItems""
                  (""Id"",""BusinessId"",""CategoryId"",""Name"",""ItemCode"",""CurrentStock"",""ReservedStock"",""PhysicalStock"",""ReorderLevel"",""RowVersion"",""DefaultUnit"",""IsActive"",""CreatedAt"")
                  VALUES ({0},{1},{2},'Business B Item','BITEM-01',200,0,200,0,{3},'PCS',true,NOW())",
                businessBItemId, businessBId, businessBCatId, businessBItemVersion);

            try
            {
                // Act — StockService scoped to Business A tries to access Business B's item
                var sutA = new StockService(_context, _user); // _user.BusinessId = _businessId (A)

                // Read: GetStockDetail for B's item — must throw KeyNotFoundException (404)
                var readAct = async () => await sutA.GetStockDetailAsync(businessBItemId);
                await readAct.Should().ThrowAsync<KeyNotFoundException>(
                    "Business A must not be able to read Business B's stock detail");

                // Adjust: AdjustStock targeting B's item — must throw KeyNotFoundException
                var adjustAct = async () => await sutA.AdjustStockAsync(businessBItemId,
                    new AdjustStockRequestDto { Reason = "Regression stock adjustment", QuantityDelta = -50, ExpectedVersion = businessBItemVersion });
                await adjustAct.Should().ThrowAsync<KeyNotFoundException>(
                    "Business A must not be able to adjust Business B's stock");

                // Activity: GetItemActivity for B's item — must throw KeyNotFoundException
                var activityAct = async () => await sutA.GetItemActivityAsync(businessBItemId, 1, 10);
                await activityAct.Should().ThrowAsync<KeyNotFoundException>(
                    "Business A must not be able to read Business B's stock movements");

                // Verify Business B's stock is completely untouched
                var bItemStock = await _context.CatalogItems
                    .AsNoTracking()
                    .IgnoreQueryFilters()
                    .FirstAsync(i => i.Id == businessBItemId);
                bItemStock.CurrentStock.Should().Be(200m, "Business B's stock must remain unmodified");
            }
            finally
            {
                // Clean up Business B data
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM \"StockMovements\" WHERE \"BusinessId\" = {0}", businessBId);
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM \"CatalogItems\" WHERE \"BusinessId\" = {0}", businessBId);
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM \"Categories\" WHERE \"BusinessId\" = {0}", businessBId);
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM \"Users\" WHERE \"Id\" = {0}", businessBUserId);
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM \"Businesses\" WHERE \"Id\" = {0}", businessBId);
            }
        }

        // ── Test 4: Physical Stock Does Not Change System Stock ───────────────────
        [RequiresDisposablePostgresFact]
        public async Task PhysicalStock_UpdateDoesNotChangeSystemStock()
        {
            // Arrange
            var item = await CreateItemAsync(current: 100, physical: 100);

            // Act
            await _sut_CreateForItem().UpdatePhysicalStockAsync(item.Id,
                new UpdatePhysicalStockRequestDto
                {
                    PhysicalStock = 93,
                    Reason = "Warehouse count",
                    ExpectedVersion = item.RowVersion
                });

            // Assert
            var updated = await _context.CatalogItems
                .AsNoTracking()
                .IgnoreQueryFilters()
                .FirstAsync(i => i.Id == item.Id);

            updated.CurrentStock.Should().Be(100m, "physical count must never change system stock");
            updated.PhysicalStock.Should().Be(93m, "physical stock must be updated");

            // Verify movement created with QuantityDelta = 0 (system didn't change)
            var movement = await _context.StockMovements
                .AsNoTracking()
                .IgnoreQueryFilters()
                .SingleAsync(m => m.CatalogItemId == item.Id);

            movement.MovementType.Should().Be("PhysicalCount");
            movement.QuantityDelta.Should().Be(0m, "PhysicalCount movement must have delta=0 since system stock did not change");
            movement.QuantityBefore.Should().Be(100m);
            movement.QuantityAfter.Should().Be(100m);
        }

        // ── Test 5: Available Stock Calculation ──────────────────────────────────
        [RequiresDisposablePostgresFact]
        public async Task AvailableStock_IsSystemMinusReserved()
        {
            // Arrange: System=100, Reserved=20 → Available=80
            var item = await CreateItemAsync(current: 100, reserved: 20);

            // Act
            var result = await _sut_CreateForItem().GetStockItemsAsync(1, 50, null, null, null);

            // Assert
            var found = result.Data.FirstOrDefault(i => i.Id == item.Id);
            found.Should().NotBeNull();
            found!.SystemStock.Should().Be(100m);
            found.ReservedStock.Should().Be(20m);
            found.AvailableStock.Should().Be(80m, "available = system - reserved");
        }

        private StockService _sut_CreateForItem() => new StockService(_context, _user);
    }

    // ── Stubs ─────────────────────────────────────────────────────────────────────

    internal class StubTenant : ITenantProvider
    {
        private readonly Guid _businessId;
        public StubTenant(Guid businessId) => _businessId = businessId;
        public Guid GetBusinessId() => _businessId;
    }

    internal class StubUser : ICurrentUserService
    {
        public StubUser(Guid businessId, Guid userId)
        {
            BusinessId = businessId;
            UserId = userId;
        }

        public Guid? UserId { get; }
        public string Email => "integ@test.com";
        public Guid? BusinessId { get; }
        public string Role => "Admin";
        public System.Collections.Generic.IEnumerable<string> Permissions =>
            new[] { "stock.view", "stock.adjust", "stock.physical", "stock.system" };
        public bool HasPermission(string permission) => true;
    }
}
