using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.Interfaces;

namespace PurchaseAssistant.Web.Controllers
{
    [ApiController]
    [Route("api/v1/catalog/brokers")]
    [Authorize]
    public class BrokersController : ControllerBase
    {
        private readonly IBrokerService _brokerService;

        public BrokersController(IBrokerService brokerService)
        {
            _brokerService = brokerService;
        }

        [HttpGet]
        [Authorize(Policy = "RequireBrokerView")]
        public async Task<ActionResult<List<BrokerDto>>> GetAll(int page = 1, int pageSize = 1000, string? search = null, CancellationToken cancellationToken = default)
        {
            return Ok(await _brokerService.SearchAsync(page, pageSize, search, cancellationToken));
        }

        [HttpGet("{id}")]
        [Authorize(Policy = "RequireBrokerView")]
        public async Task<ActionResult<BrokerDto>> GetById(Guid id, CancellationToken cancellationToken = default)
        {
            var broker = await _brokerService.GetByIdAsync(id, cancellationToken);
            return broker != null ? Ok(broker) : NotFound();
        }

        [HttpPost]
        [Authorize(Policy = "RequireBrokerCreate")]
        public async Task<ActionResult<BrokerDto>> Create([FromBody] BrokerDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _brokerService.CreateAsync(dto, cancellationToken);
                return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
            }
            catch (InvalidOperationException ex) when (ex.Message == "BROKER_EXISTS")
            {
                return Conflict(new { error = "BROKER_EXISTS" });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Policy = "RequireBrokerEdit")]
        public async Task<ActionResult<BrokerDto>> Update(Guid id, [FromBody] BrokerDto dto, CancellationToken cancellationToken = default)
        {
            try
            {
                return Ok(await _brokerService.UpdateAsync(id, dto, cancellationToken));
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Policy = "RequireBrokerDelete")]
        public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default)
        {
            try
            {
                await _brokerService.DeleteAsync(id, cancellationToken);
                return NoContent();
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (InvalidOperationException ex) when (ex.Message == "BROKER_IN_USE")
            {
                return Conflict(new { error = "BROKER_IN_USE" });
            }
        }
    }
}
