using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Services.Backups;
namespace PurchaseAssistant.Web.Controllers;

[ApiController]
[Route("api/v1/exports/database-backups")]
[Authorize(Policy = "RequireDatabaseBackup")]
public class DatabaseBackupsController(DatabaseBackupService service, ICurrentUserService user, IAuthorizationService authorization) : ControllerBase
{
    private Guid Actor => user.UserId ?? throw new UnauthorizedAccessException();
    private async Task<IActionResult> Safe(Func<Task<IActionResult>> action)
    {
        try { return await action(); }
        catch (BackupBusyException) { return Conflict(new { message = "Another backup operation is queued or running. Refresh its progress before retrying." }); }
        catch (BackupFailure e) { return StatusCode(503, new { message = "Backup storage or verification is unavailable.", code = e.Code }); }
        catch (ArgumentException) { return BadRequest(new { message = "Check the schedule, confirmation and archive availability. The latest validated or pinned archive cannot be removed." }); }
    }
    [HttpGet]
    public Task<IActionResult> Overview(CancellationToken ct) => Safe(async () => Ok(new { overview = await service.Overview(ct), canRecover = (await authorization.AuthorizeAsync(User, "RequireDatabaseRecovery")).Succeeded }));
    [HttpPut("settings")]
    public Task<IActionResult> Settings(DatabaseBackupSettings settings, CancellationToken ct) => Safe(async () => Ok(await service.SaveSettings(settings, Actor, ct)));
    [HttpPost]
    public Task<IActionResult> Create(CancellationToken ct) => Safe(async () => { var job = await service.Enqueue(Actor, null, ct); return Accepted(new { job.Id, job.Status }); });
    [HttpPost("{id:guid}/verify")]
    public Task<IActionResult> Verify(Guid id, CancellationToken ct) => Safe(async () => { var job = await service.Enqueue(Actor, id, ct); return Accepted(new { job.Id, job.Status }); });
    [HttpGet("{id:guid}/download")]
    public Task<IActionResult> Download(Guid id, CancellationToken ct) => Safe(async () => File(await service.Download(id, Actor, ct), "application/octet-stream", $"{id:N}.wab"));
    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, CancellationToken ct) => Safe(async () => { await service.Delete(id, Actor, ct); return NoContent(); });
    public record PinRequest(bool Pinned);
    [HttpPut("{id:guid}/pin")]
    public Task<IActionResult> Pin(Guid id, PinRequest request, CancellationToken ct) => Safe(async () => { await service.Pin(id, request.Pinned, Actor, ct); return NoContent(); });
    public record RecoveryRequest(bool Confirmed);
    [HttpPost("{id:guid}/recovery-preflight")]
    [Authorize(Policy = "RequireDatabaseRecovery")]
    public Task<IActionResult> Preflight(Guid id, RecoveryRequest request, CancellationToken ct) => Safe(async () => Ok(await service.RecoveryPreflight(id, Actor, request.Confirmed, ct)));
}
