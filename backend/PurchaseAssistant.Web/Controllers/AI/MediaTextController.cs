using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PurchaseAssistant.Web.Services;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Infrastructure.Data;

namespace PurchaseAssistant.Web.Controllers.AI;
[ApiController, Route("api/v1/ai/media"), Authorize(Policy = "RequirePurchaseCreate"), EnableRateLimiting("ai")]
public class MediaTextController(MediaTextService service, AppDbContext db, ICurrentUserService user, ILogger<MediaTextController> logger) : ControllerBase
{
    [HttpGet("capabilities")]
    public async Task<IActionResult> Capabilities(CancellationToken ct) { Response.Headers.CacheControl = "private, no-store"; return Ok(await service.Capabilities(ct)); }
    [HttpPost("{kind}"), RequestSizeLimit(7_100_000)]
    public async Task<IActionResult> Extract(string kind, MediaTextRequest input, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store";
        if (kind is not ("ocr" or "voice")) return NotFound();
        var watch = System.Diagnostics.Stopwatch.StartNew(); var attempted = false;
        try { var result = await service.ExtractAsync(kind == "ocr", input, ct); attempted = true; return Ok(result); }
        catch (MediaProviderException ex) { attempted = ex.Status != 503; return StatusCode(ex.Status, new { error = new { code = ex.Message, message = "The media provider could not complete this request. Check configuration or try again later; manual text entry remains available." } }); }
        finally {
            if (attempted && user.BusinessId is Guid business) try {
                db.AiUsageLogs.Add(new AiUsageLog { BusinessId = business, Feature = kind == "ocr" ? "image_text" : "voice_text", Endpoint = "media/" + kind,
                    Provider = kind == "ocr" ? "gemini" : "groq", LatencyMs = (int)Math.Min(watch.ElapsedMilliseconds, int.MaxValue) });
                await db.SaveChangesAsync(ct);
            } catch (Exception) { logger.LogWarning("Media usage metadata could not be recorded."); }
        }
    }
}
