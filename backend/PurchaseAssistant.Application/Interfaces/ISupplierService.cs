using PurchaseAssistant.Application.DTOs.Catalog;

namespace PurchaseAssistant.Application.Interfaces
{
    public interface ISupplierService
    {
        Task<List<SupplierDto>> GetAllAsync(CancellationToken cancellationToken = default);
        Task<List<SupplierDto>> SearchAsync(int page, int pageSize, string? search, CancellationToken cancellationToken = default);
        Task<SupplierDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
        Task<SupplierDto> CreateAsync(SupplierDto dto, CancellationToken cancellationToken = default);
        Task<SupplierDto> UpdateAsync(Guid id, SupplierDto dto, CancellationToken cancellationToken = default);
        Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
        Task<List<SupplierItemDto>> GetItemsAsync(Guid supplierId, CancellationToken cancellationToken = default);
        Task<SupplierItemDto> AddItemAsync(Guid supplierId, SupplierItemInputDto dto, CancellationToken cancellationToken = default);
        Task<SupplierItemDto> UpdateItemAsync(Guid supplierId, Guid linkId, SupplierItemInputDto dto, CancellationToken cancellationToken = default);
        Task RemoveItemAsync(Guid supplierId, Guid linkId, CancellationToken cancellationToken = default);
    }
}
