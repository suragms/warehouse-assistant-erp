using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;

namespace PurchaseAssistant.Infrastructure.Services
{
    public class SupplierService : ISupplierService
    {
        private readonly AppDbContext _context;
        private readonly IEntityNormalizationService _normalization;
        private readonly ICurrentUserService _currentUser;

        public SupplierService(AppDbContext context, IEntityNormalizationService normalization, ICurrentUserService currentUser)
        {
            _context = context;
            _normalization = normalization;
            _currentUser = currentUser;
        }

        public Task<List<SupplierDto>> GetAllAsync(CancellationToken cancellationToken = default) => SearchAsync(1, 1000, null, cancellationToken);

        public async Task<List<SupplierDto>> SearchAsync(int page, int pageSize, string? search, CancellationToken cancellationToken = default)
        {
            if (page is < 1 or > 10000 || pageSize is < 1 or > 1000 || search?.Length > 200) throw new ArgumentException("Invalid contact search or page.");
            var query = _context.Suppliers.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); query = query.Where(x => x.Name.Contains(term)); }
            return await query
                .OrderBy(s => s.Name).ThenBy(s => s.Id).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(s => new SupplierDto
                {
                    Id = s.Id, Name = s.Name, Phone = s.Phone, Address = s.Address,
                    Notes = s.Notes, IsActive = s.IsActive,
                    LinkedItemsCount = _context.SupplierItems.Count(i => i.SupplierId == s.Id)
                }).ToListAsync(cancellationToken);
        }

        public async Task<SupplierDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        {
            var sup = await _context.Suppliers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (sup == null) return null;

            var count = await _context.SupplierItems.CountAsync(i => i.SupplierId == sup.Id, cancellationToken);
            return new SupplierDto
            {
                Id = sup.Id,
                Name = sup.Name,
                Phone = sup.Phone,
                Address = sup.Address,
                Notes = sup.Notes,
                IsActive = sup.IsActive,
                LinkedItemsCount = count
            };
        }

        public async Task<SupplierDto> CreateAsync(SupplierDto dto, CancellationToken cancellationToken = default)
        {
            var normalizedName = _normalization.NormalizeName(dto.Name);
            var businessId = _currentUser.BusinessId ?? throw new InvalidOperationException("BUSINESS_CONTEXT_REQUIRED");

            var existing = await _context.Suppliers
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.BusinessId == businessId && s.Name.ToLower() == normalizedName, cancellationToken);

            if (existing != null)
            {
                throw new InvalidOperationException("SUPPLIER_EXISTS");
            }

            var supplier = new Supplier
            {
                BusinessId = businessId,
                Name = dto.Name.Trim(),
                Phone = _normalization.NormalizePhone(dto.Phone),
                Address = dto.Address?.Trim(),
                Notes = dto.Notes?.Trim(),
                IsActive = dto.IsActive
            };

            _context.Suppliers.Add(supplier);
            await _context.SaveChangesAsync(cancellationToken);

            return new SupplierDto
            {
                Id = supplier.Id,
                Name = supplier.Name,
                Phone = supplier.Phone,
                Address = supplier.Address,
                Notes = supplier.Notes,
                IsActive = supplier.IsActive,
                LinkedItemsCount = 0
            };
        }

        public async Task<SupplierDto> UpdateAsync(Guid id, SupplierDto dto, CancellationToken cancellationToken = default)
        {
            var supplier = await _context.Suppliers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (supplier == null) throw new KeyNotFoundException("SUPPLIER_NOT_FOUND");

            supplier.Name = dto.Name.Trim();
            supplier.Phone = _normalization.NormalizePhone(dto.Phone);
            supplier.Address = dto.Address?.Trim();
            supplier.Notes = dto.Notes?.Trim();
            supplier.IsActive = dto.IsActive;
            supplier.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            var count = await _context.SupplierItems.CountAsync(i => i.SupplierId == supplier.Id, cancellationToken);

            return new SupplierDto
            {
                Id = supplier.Id,
                Name = supplier.Name,
                Phone = supplier.Phone,
                Address = supplier.Address,
                Notes = supplier.Notes,
                IsActive = supplier.IsActive,
                LinkedItemsCount = count
            };
        }

        public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
        {
            var supplier = await _context.Suppliers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (supplier == null) throw new KeyNotFoundException("SUPPLIER_NOT_FOUND");

            // Check if in use in purchase orders (for now just check supplier items or let relational integrity handle)
            var hasItems = await _context.SupplierItems.AnyAsync(i => i.SupplierId == id, cancellationToken);
            if (hasItems)
            {
                throw new InvalidOperationException("SUPPLIER_IN_USE");
            }

            _context.Suppliers.Remove(supplier);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<List<SupplierItemDto>> GetItemsAsync(Guid supplierId, CancellationToken cancellationToken = default)
        {
            await EnsureSupplierExistsAsync(supplierId, cancellationToken);
            return await _context.SupplierItems.AsNoTracking()
                .Where(link => link.SupplierId == supplierId)
                .OrderBy(link => link.CatalogItem.Name)
                .Select(link => new SupplierItemDto
                {
                    Id = link.Id,
                    SupplierId = link.SupplierId,
                    CatalogItemId = link.CatalogItemId,
                    ItemCode = link.CatalogItem.ItemCode,
                    ItemName = link.CatalogItem.Name,
                    SupplierItemCode = link.SupplierItemCode,
                    IsDefault = link.IsDefault,
                    Notes = link.Notes
                }).ToListAsync(cancellationToken);
        }

        public async Task<SupplierItemDto> AddItemAsync(Guid supplierId, SupplierItemInputDto dto, CancellationToken cancellationToken = default)
        {
            var businessId = _currentUser.BusinessId ?? throw new InvalidOperationException("BUSINESS_CONTEXT_REQUIRED");
            await EnsureSupplierExistsAsync(supplierId, cancellationToken);
            var item = await _context.CatalogItems.FirstOrDefaultAsync(x => x.Id == dto.CatalogItemId && x.BusinessId == businessId, cancellationToken)
                ?? throw new KeyNotFoundException("CATALOG_ITEM_NOT_FOUND");

            if (await _context.SupplierItems.AnyAsync(x => x.SupplierId == supplierId && x.CatalogItemId == item.Id, cancellationToken))
                throw new InvalidOperationException("SUPPLIER_ITEM_EXISTS");

            var link = new SupplierItem
            {
                BusinessId = businessId,
                SupplierId = supplierId,
                CatalogItemId = item.Id,
                SupplierItemCode = NormalizeCode(dto.SupplierItemCode),
                IsDefault = dto.IsDefault,
                Notes = NormalizeNotes(dto.Notes)
            };
            if (link.IsDefault)
                await ClearOtherDefaultsAsync(item.Id, null, cancellationToken);

            _context.SupplierItems.Add(link);
            await _context.SaveChangesAsync(cancellationToken);
            return ToSupplierItemDto(link, item);
        }

        public async Task<SupplierItemDto> UpdateItemAsync(Guid supplierId, Guid linkId, SupplierItemInputDto dto, CancellationToken cancellationToken = default)
        {
            var link = await _context.SupplierItems
                .Include(x => x.CatalogItem)
                .FirstOrDefaultAsync(x => x.Id == linkId && x.SupplierId == supplierId, cancellationToken)
                ?? throw new KeyNotFoundException("SUPPLIER_ITEM_NOT_FOUND");

            if (dto.CatalogItemId != Guid.Empty && dto.CatalogItemId != link.CatalogItemId)
                throw new InvalidOperationException("SUPPLIER_ITEM_CATALOG_ITEM_IMMUTABLE");

            if (dto.IsDefault)
                await ClearOtherDefaultsAsync(link.CatalogItemId, link.Id, cancellationToken);
            link.SupplierItemCode = NormalizeCode(dto.SupplierItemCode);
            link.IsDefault = dto.IsDefault;
            link.Notes = NormalizeNotes(dto.Notes);
            link.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            return ToSupplierItemDto(link, link.CatalogItem);
        }

        public async Task RemoveItemAsync(Guid supplierId, Guid linkId, CancellationToken cancellationToken = default)
        {
            var link = await _context.SupplierItems.FirstOrDefaultAsync(x => x.Id == linkId && x.SupplierId == supplierId, cancellationToken)
                ?? throw new KeyNotFoundException("SUPPLIER_ITEM_NOT_FOUND");
            _context.SupplierItems.Remove(link);
            await _context.SaveChangesAsync(cancellationToken);
        }

        private async Task EnsureSupplierExistsAsync(Guid supplierId, CancellationToken cancellationToken)
        {
            if (!await _context.Suppliers.AnyAsync(x => x.Id == supplierId, cancellationToken))
                throw new KeyNotFoundException("SUPPLIER_NOT_FOUND");
        }

        private async Task ClearOtherDefaultsAsync(Guid catalogItemId, Guid? exceptLinkId, CancellationToken cancellationToken)
        {
            var previousDefaults = await _context.SupplierItems
                .Where(x => x.CatalogItemId == catalogItemId && x.IsDefault && (!exceptLinkId.HasValue || x.Id != exceptLinkId.Value))
                .ToListAsync(cancellationToken);
            foreach (var previous in previousDefaults)
            {
                previous.IsDefault = false;
                previous.UpdatedAt = DateTime.UtcNow;
            }
        }

        private static string? NormalizeCode(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        private static string? NormalizeNotes(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private static SupplierItemDto ToSupplierItemDto(SupplierItem link, CatalogItem item) => new()
        {
            Id = link.Id,
            SupplierId = link.SupplierId,
            CatalogItemId = link.CatalogItemId,
            ItemCode = item.ItemCode,
            ItemName = item.Name,
            SupplierItemCode = link.SupplierItemCode,
            IsDefault = link.IsDefault,
            Notes = link.Notes
        };
    }
}
