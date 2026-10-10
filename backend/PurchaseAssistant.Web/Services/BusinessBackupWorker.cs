using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Infrastructure.Services;

namespace PurchaseAssistant.Web.Services;

public class BusinessBackupWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<BusinessBackupWorker> logger, IConfiguration configuration) : BackgroundService
{
    public static DateTimeOffset NextRun(DateTimeOffset now)
    {
        var india = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
        var local = TimeZoneInfo.ConvertTime(now, india);
        var next = local.Date.AddHours(2);
        if (next <= local.DateTime) next = next.AddDays(1);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(next, india));
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextLegacyExport = NextRun(clock.GetUtcNow());
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<PurchaseAssistant.Infrastructure.Services.Backups.DatabaseBackupService>().Tick(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
                catch (Exception) { logger.LogWarning("Database recovery worker is unavailable; pending jobs remain stored"); }
                // Existing tenant report extracts remain distinct from full database recovery archives.
                if (configuration.GetValue("Backup:LegacyBusinessExportsEnabled", true) && clock.GetUtcNow() >= nextLegacyExport)
                {
                    nextLegacyExport = NextRun(clock.GetUtcNow());
                    List<Guid> businesses;
                    using (var scope = scopes.CreateScope()) businesses = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Businesses
                        .AsNoTracking().Where(x => x.IsActive).Select(x => x.Id).ToListAsync(stoppingToken);
                    foreach (var id in businesses)
                    {
                        try { using var scope = scopes.CreateScope(); await scope.ServiceProvider.GetRequiredService<BusinessBackupService>().RunAsync(id, "scheduled", null, stoppingToken); }
                        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
                        catch (Exception) { logger.LogWarning("Scheduled business export could not be recorded"); }
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception) { logger.LogWarning("Backup worker is unavailable; pending jobs remain stored"); }
            try { await Task.Delay(TimeSpan.FromSeconds(30), clock, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
