using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;

namespace PurchaseAssistant.Infrastructure.Services
{
    public class BrokerService : IBrokerService
    {
        private readonly AppDbContext _context;
        private readonly IEntityNormalizationService _normalization;
        private readonly ICurrentUserService _currentUser;

        public BrokerService(AppDbContext context, IEntityNormalizationService normalization, ICurrentUserService currentUser)
        {
            _context = context;
            _normalization = normalization;
            _currentUser = currentUser;
        }

        public Task<List<BrokerDto>> GetAllAsync(CancellationToken cancellationToken = default) => SearchAsync(1, 1000, null, cancellationToken);

        public async Task<List<BrokerDto>> SearchAsync(int page, int pageSize, string? search, CancellationToken cancellationToken = default)
        {
            if (page is < 1 or > 10000 || pageSize is < 1 or > 1000 || search?.Length > 200) throw new ArgumentException("Invalid contact search or page.");
            var query = _context.Brokers.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); query = query.Where(x => x.Name.Contains(term)); }
            return await query
                .OrderBy(b => b.Name).ThenBy(b => b.Id).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(brk => new BrokerDto
                {
                    Id = brk.Id,
                    Name = brk.Name,
                    ImageUrl = brk.ImageUrl,
                    IsActive = brk.IsActive,
                    LinkedSuppliersCount = _context.BrokerSuppliers.Count(bs => bs.BrokerId == brk.Id)
                }).ToListAsync(cancellationToken);
        }

        public async Task<BrokerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        {
            var brk = await _context.Brokers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (brk == null) return null;

            var count = await _context.BrokerSuppliers.CountAsync(bs => bs.BrokerId == brk.Id, cancellationToken);
            return new BrokerDto
            {
                Id = brk.Id,
                Name = brk.Name,
                    ImageUrl = brk.ImageUrl,
                IsActive = brk.IsActive,
                LinkedSuppliersCount = count
            };
        }

        public async Task<BrokerDto> CreateAsync(BrokerDto dto, CancellationToken cancellationToken = default)
        {
            var normalizedName = _normalization.NormalizeName(dto.Name);
            var businessId = _currentUser.BusinessId ?? throw new InvalidOperationException("BUSINESS_CONTEXT_REQUIRED");

            var existing = await _context.Brokers
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(b => b.BusinessId == businessId && b.Name.ToLower() == normalizedName, cancellationToken);

            if (existing != null)
            {
                throw new InvalidOperationException("BROKER_EXISTS");
            }

            var broker = new Broker
            {
                BusinessId = businessId,
                Name = dto.Name.Trim(),
                ImageUrl = PurchaseAssistant.Application.DTOs.SafeImageUrl.Validate(dto.ImageUrl),
                IsActive = dto.IsActive
            };

            _context.Brokers.Add(broker);
            await _context.SaveChangesAsync(cancellationToken);

            return new BrokerDto
            {
                Id = broker.Id,
                Name = broker.Name,
                ImageUrl = broker.ImageUrl,
                IsActive = broker.IsActive,
                LinkedSuppliersCount = 0
            };
        }

        public async Task<BrokerDto> UpdateAsync(Guid id, BrokerDto dto, CancellationToken cancellationToken = default)
        {
            var broker = await _context.Brokers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (broker == null) throw new KeyNotFoundException("BROKER_NOT_FOUND");

            broker.Name = dto.Name.Trim();
            broker.ImageUrl = PurchaseAssistant.Application.DTOs.SafeImageUrl.Validate(dto.ImageUrl);
            broker.IsActive = dto.IsActive;
            broker.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            var count = await _context.BrokerSuppliers.CountAsync(bs => bs.BrokerId == broker.Id, cancellationToken);

            return new BrokerDto
            {
                Id = broker.Id,
                Name = broker.Name,
                ImageUrl = broker.ImageUrl,
                IsActive = broker.IsActive,
                LinkedSuppliersCount = count
            };
        }

        public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
        {
            var broker = await _context.Brokers.FirstOrDefaultAsync(x => x.Id == id && x.BusinessId == _currentUser.BusinessId, cancellationToken);
            if (broker == null) throw new KeyNotFoundException("BROKER_NOT_FOUND");

            var hasSuppliers = await _context.BrokerSuppliers.AnyAsync(bs => bs.BrokerId == id, cancellationToken);
            if (hasSuppliers)
            {
                throw new InvalidOperationException("BROKER_IN_USE");
            }

            _context.Brokers.Remove(broker);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
