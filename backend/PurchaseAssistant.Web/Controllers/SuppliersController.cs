using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;

namespace PurchaseAssistant.Web.Controllers
{
    [ApiController]
    [Route("api/v1/catalog/suppliers")]
    [Authorize]
    public class SuppliersController : ControllerBase
    {
        private readonly ISupplierService _supplierService;

        public SuppliersController(ISupplierService supplierService)
        {
            _supplierService = supplierService;
        }

        [HttpGet]
        [Authorize(Policy = "RequireSupplierView")]
        public async Task<ActionResult<List<SupplierDto>>> GetAll(int page = 1, int pageSize = 1000, string? search = null, CancellationToken cancellationToken = default)
        {
            return Ok(await _supplierService.SearchAsync(page, pageSize, search, cancellationToken));
        }

        [HttpGet("{id}")]
        [Authorize(Policy = "RequireSupplierView")]
        public async Task<ActionResult<SupplierDto>> GetById(Guid id, CancellationToken cancellationToken = default)
        {
            var supplier = await _supplierService.GetByIdAsync(id, cancellationToken);
            return supplier != null ? Ok(supplier) : NotFound();
        }

        [HttpPost]
        [Authorize(Policy = "RequireSupplierCreate")]
        public async Task<ActionResult<SupplierDto>> Create([FromBody] SupplierDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _supplierService.CreateAsync(dto, cancellationToken);
                return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
            }
            catch (InvalidOperationException ex) when (ex.Message == "SUPPLIER_EXISTS")
            {
                return Conflict(new { error = "SUPPLIER_EXISTS" });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Policy = "RequireSupplierEdit")]
        public async Task<ActionResult<SupplierDto>> Update(Guid id, [FromBody] SupplierDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                return Ok(await _supplierService.UpdateAsync(id, dto, cancellationToken));
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Policy = "RequireSupplierDelete")]
        public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default)
        {
            try
            {
                await _supplierService.DeleteAsync(id, cancellationToken);
                return NoContent();
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (InvalidOperationException ex) when (ex.Message == "SUPPLIER_IN_USE")
            {
                return Conflict(new { error = "SUPPLIER_IN_USE" });
            }
        }

        [HttpGet("{id:guid}/items")]
        [Authorize(Policy = "RequireSupplierView")]
        public async Task<ActionResult<List<SupplierItemDto>>> GetItems(Guid id, CancellationToken cancellationToken = default)
        {
            try { return Ok(await _supplierService.GetItemsAsync(id, cancellationToken)); }
            catch (KeyNotFoundException) { return NotFound(); }
        }

        [HttpPost("{id:guid}/items")]
        [Authorize(Policy = "RequireSupplierEdit")]
        public async Task<ActionResult<SupplierItemDto>> AddItem(Guid id, [FromBody] SupplierItemInputDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _supplierService.AddItemAsync(id, dto, cancellationToken);
                return CreatedAtAction(nameof(GetItems), new { id }, result);
            }
            catch (KeyNotFoundException) { return NotFound(); }
            catch (InvalidOperationException ex) when (ex.Message == "SUPPLIER_ITEM_EXISTS")
            { return Conflict(new { error = "SUPPLIER_ITEM_EXISTS" }); }
        }

        [HttpPut("{id:guid}/items/{linkId:guid}")]
        [Authorize(Policy = "RequireSupplierEdit")]
        public async Task<ActionResult<SupplierItemDto>> UpdateItem(Guid id, Guid linkId, [FromBody] SupplierItemInputDto dto, CancellationToken cancellationToken = default)
        {
            try { return Ok(await _supplierService.UpdateItemAsync(id, linkId, dto, cancellationToken)); }
            catch (KeyNotFoundException) { return NotFound(); }
            catch (InvalidOperationException ex) when (ex.Message == "SUPPLIER_ITEM_CATALOG_ITEM_IMMUTABLE")
            { return BadRequest(new { error = ex.Message }); }
        }

        [HttpDelete("{id:guid}/items/{linkId:guid}")]
        [Authorize(Policy = "RequireSupplierEdit")]
        public async Task<IActionResult> RemoveItem(Guid id, Guid linkId, CancellationToken cancellationToken = default)
        {
            try { await _supplierService.RemoveItemAsync(id, linkId, cancellationToken); return NoContent(); }
            catch (KeyNotFoundException) { return NotFound(); }
        }
    }
}
