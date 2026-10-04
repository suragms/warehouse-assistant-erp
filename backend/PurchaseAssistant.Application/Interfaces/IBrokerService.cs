using PurchaseAssistant.Application.DTOs.Catalog;

namespace PurchaseAssistant.Application.Interfaces
{
    public interface IBrokerService
    {
        Task<List<BrokerDto>> GetAllAsync(CancellationToken cancellationToken = default);
        Task<List<BrokerDto>> SearchAsync(int page, int pageSize, string? search, CancellationToken cancellationToken = default);
        Task<BrokerDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
        Task<BrokerDto> CreateAsync(BrokerDto dto, CancellationToken cancellationToken = default);
        Task<BrokerDto> UpdateAsync(Guid id, BrokerDto dto, CancellationToken cancellationToken = default);
        Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    }
}
