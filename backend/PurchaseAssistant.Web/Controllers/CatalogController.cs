using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Contracts.Responses;

namespace PurchaseAssistant.Web.Controllers
{
    [ApiController]
    [Route("api/v1/catalog/items")]
    [Authorize]
    public class CatalogController : ControllerBase
    {
        private readonly ICatalogService _catalogService;

        public CatalogController(ICatalogService catalogService)
        {
            _catalogService = catalogService;
        }

        [HttpGet]
        [Authorize(Policy = "RequireCatalogView")]
        public async Task<ActionResult<PaginatedResult<CatalogItemDto>>> GetAll(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            [FromQuery] string? search = null,
            [FromQuery] Guid? categoryId = null,
            CancellationToken cancellationToken = default)
        {
            return Ok(await _catalogService.GetAllAsync(page, pageSize, search, categoryId, cancellationToken));
        }

        [HttpGet("duplicates")]
        [Authorize(Policy = "RequireCatalogView")]
        public async Task<ActionResult<ApiResponse<List<DuplicateCandidateDto>>>> GetDuplicateCandidates([FromQuery] int? minSimilarity = 70)
        {
            var duplicates = await _catalogService.GetDuplicateCandidatesAsync(minSimilarity);
            return Ok(new ApiResponse<List<DuplicateCandidateDto>>(duplicates));
        }

        [HttpGet("by-barcode")]
        [Authorize(Policy = "RequireCatalogView")]
        public Task<ActionResult<CatalogItemDto>> GetByBarcodeQuery([FromQuery] string barcode) => GetByBarcode(barcode);

        [HttpGet("by-barcode/{barcode}")]
        [Authorize(Policy = "RequireCatalogView")]
        public async Task<ActionResult<CatalogItemDto>> GetByBarcode(string barcode)
        {
            try
            {
                var item = await _catalogService.GetByBarcodeAsync(barcode);
                return item == null ? NotFound(new { error = "BARCODE_NOT_FOUND" }) : Ok(item);
            }
            catch (ArgumentException ex) { return BadRequest(new { error = "INVALID_BARCODE", message = ex.Message }); }
        }

        [HttpGet("{id}")]
        [Authorize(Policy = "RequireCatalogView")]
        public async Task<ActionResult<CatalogItemDetailDto>> GetById(Guid id, CancellationToken cancellationToken = default)
        {
            var item = await _catalogService.GetByIdAsync(id, cancellationToken);
            return item != null ? Ok(item) : NotFound();
        }

        [HttpPost]
        [Authorize(Policy = "RequireCatalogCreate")]
        public async Task<ActionResult<CatalogItemDto>> Create([FromBody] CatalogItemDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _catalogService.CreateAsync(dto, cancellationToken);
                return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
            }
            catch (InvalidOperationException ex) when (ex.Message is "DUPLICATE_ITEM_CODE_OR_BARCODE" or "DUPLICATE_BARCODE")
            {
                return Conflict(new { error = ex.Message });
            }
            catch (ArgumentException ex) { return BadRequest(new { error = "INVALID_CATALOG_INPUT", message = ex.Message }); }
        }

        [HttpPut("{id}")]
        [Authorize(Policy = "RequireCatalogEdit")]
        public async Task<ActionResult<CatalogItemDto>> Update(Guid id, [FromBody] CatalogItemDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                return Ok(await _catalogService.UpdateAsync(id, dto, cancellationToken));
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (InvalidOperationException ex) when (ex.Message == "CATALOG_ITEM_VERSION_CONFLICT")
            {
                return Conflict(new { error = "CATALOG_ITEM_VERSION_CONFLICT" });
            }
            catch (InvalidOperationException ex) when (ex.Message is "DUPLICATE_ITEM_CODE_OR_BARCODE" or "DUPLICATE_BARCODE")
            {
                return Conflict(new { error = ex.Message });
            }
            catch (ArgumentException ex) { return BadRequest(new { error = "INVALID_CATALOG_INPUT", message = ex.Message }); }
        }

        [HttpPatch("{id}/barcode")]
        [Authorize(Policy = "RequireCatalogEdit")]
        public async Task<ActionResult<CatalogItemDto>> AssignBarcode(Guid id, BarcodeAssignmentDto dto, CancellationToken cancellationToken = default)
            => await BarcodeMutation(() => _catalogService.AssignBarcodeAsync(id, dto, cancellationToken));

        [HttpPost("{id}/barcode/generate")]
        [Authorize(Policy = "RequireCatalogEdit")]
        public async Task<ActionResult<CatalogItemDto>> GenerateBarcode(Guid id, GenerateBarcodeDto dto, CancellationToken cancellationToken = default)
            => await BarcodeMutation(() => _catalogService.GenerateBarcodeAsync(id, dto.ExpectedVersion, cancellationToken));

        private async Task<ActionResult<CatalogItemDto>> BarcodeMutation(Func<Task<CatalogItemDto>> operation)
        {
            try { return Ok(await operation()); }
            catch (KeyNotFoundException) { return NotFound(new { error = "CATALOG_ITEM_NOT_FOUND" }); }
            catch (ArgumentException ex) { return BadRequest(new { error = "INVALID_BARCODE", message = ex.Message }); }
            catch (InvalidOperationException ex) when (ex.Message is "DUPLICATE_BARCODE" or "CATALOG_ITEM_VERSION_CONFLICT"
                or "CATALOG_ITEM_BARCODE_EXISTS" or "CATALOG_ITEM_INACTIVE")
            { return Conflict(new { error = ex.Message }); }
        }

        [HttpDelete("{id}")]
        [Authorize(Policy = "RequireCatalogArchive")]
        public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default)
        {
            try
            {
                await _catalogService.DeleteAsync(id, cancellationToken);
                return NoContent();
            }
            catch (InvalidOperationException ex) when (ex.Message == "CATALOG_ITEM_IN_USE")
            {
                return Conflict(new { error = "This item has stock or purchase history. Archive it instead of deleting it." });
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpGet("{id}/variants")]
        [Authorize(Policy = "RequireCatalogView")]
        public async Task<ActionResult<List<VariantDto>>> GetVariants(Guid id, CancellationToken cancellationToken = default)
            => Ok(await _catalogService.GetVariantsAsync(id, cancellationToken));

        [HttpPost("{id}/variants")]
        [Authorize(Policy = "RequireCatalogCreate")]
        public async Task<ActionResult<VariantDto>> CreateVariant(Guid id, VariantDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _catalogService.CreateVariantAsync(id, dto, cancellationToken);
                return CreatedAtAction(nameof(GetVariants), new { id }, result);
            }
            catch (InvalidOperationException ex) when (IsVariantConflict(ex)) { return Conflict(new { error = VariantError(ex) }); }
        }

        [HttpPut("{id}/variants/{variantId}")]
        [Authorize(Policy = "RequireCatalogEdit")]
        public async Task<ActionResult<VariantDto>> UpdateVariant(Guid id, Guid variantId, VariantDto dto, CancellationToken cancellationToken = default)
        {
            try { return Ok(await _catalogService.UpdateVariantAsync(id, variantId, dto, cancellationToken)); }
            catch (InvalidOperationException ex) when (IsVariantConflict(ex)) { return Conflict(new { error = VariantError(ex) }); }
        }

        [HttpDelete("{id}/variants/{variantId}")]
        [Authorize(Policy = "RequireCatalogArchive", Roles = "Owner")]
        public async Task<IActionResult> DeleteVariant(Guid id, Guid variantId, [FromQuery] Guid expectedVersion, CancellationToken cancellationToken = default)
        {
            try { await _catalogService.DeleteVariantAsync(id, variantId, expectedVersion, cancellationToken); return NoContent(); }
            catch (InvalidOperationException ex) when (IsVariantConflict(ex)) { return Conflict(new { error = VariantError(ex) }); }
        }

        private static bool IsVariantConflict(InvalidOperationException ex)
            => ex.Message is "DUPLICATE_VARIANT_NAME" or "VARIANT_VERSION_CONFLICT";
        private static string VariantError(InvalidOperationException ex) => ex.Message == "DUPLICATE_VARIANT_NAME"
            ? "A variant with this name already exists for this item."
            : "This variant changed. Reload it before saving or deleting.";

        [HttpPatch("{id}/archive")]
        [Authorize(Policy = "RequireCatalogArchive")]
        public async Task<IActionResult> Archive(Guid id, CatalogItemDto dto, CancellationToken cancellationToken = default)
        {
            try { await _catalogService.ArchiveAsync(id, dto.RowVersion, cancellationToken); return NoContent(); }
            catch (InvalidOperationException ex) when (ex.Message == "CATALOG_ITEM_VERSION_CONFLICT")
            { return Conflict(new { error = "This item changed. Reload it before archiving." }); }
        }
    }
}
