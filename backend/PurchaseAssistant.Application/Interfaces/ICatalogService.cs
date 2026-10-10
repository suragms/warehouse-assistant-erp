using PurchaseAssistant.Application.DTOs.Catalog;

namespace PurchaseAssistant.Application.Interfaces
{
    public interface ICatalogService
    {
        Task<PaginatedResult<CatalogItemDto>> GetAllAsync(int page = 1, int pageSize = 50, string? search = null, Guid? categoryId = null, CancellationToken cancellationToken = default);
        Task<CatalogItemDetailDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
        Task<CatalogItemDto?> GetByBarcodeAsync(string barcode);
        Task<CatalogItemDto> AssignBarcodeAsync(Guid id, BarcodeAssignmentDto dto, CancellationToken cancellationToken = default);
        Task<CatalogItemDto> GenerateBarcodeAsync(Guid id, Guid expectedVersion, CancellationToken cancellationToken = default);
        Task<CatalogItemDto> CreateAsync(CatalogItemDto dto, CancellationToken cancellationToken = default);
        Task<CatalogItemDto> UpdateAsync(Guid id, CatalogItemDto dto, CancellationToken cancellationToken = default);
        Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
        Task ArchiveAsync(Guid id, Guid expectedVersion, CancellationToken cancellationToken = default);
        Task<List<VariantDto>> GetVariantsAsync(Guid itemId, CancellationToken cancellationToken = default);
        Task<VariantDto> CreateVariantAsync(Guid itemId, VariantDto dto, CancellationToken cancellationToken = default);
        Task<VariantDto> UpdateVariantAsync(Guid itemId, Guid variantId, VariantDto dto, CancellationToken cancellationToken = default);
        Task DeleteVariantAsync(Guid itemId, Guid variantId, Guid expectedVersion, CancellationToken cancellationToken = default);
        Task<List<DuplicateCandidateDto>> GetDuplicateCandidatesAsync(int? minSimilarity = 70);
    }
}
