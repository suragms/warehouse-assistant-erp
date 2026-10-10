using MailKit.Security;
using MimeKit;

namespace PurchaseAssistant.Web.Services;
public interface IRecoveryMailSender
{
    bool Available { get; }
    Task SendAsync(string email, string token, CancellationToken ct);
}
public class RecoveryMailSender(IConfiguration config) : IRecoveryMailSender
{
    public bool Available => config.GetValue<bool>("Recovery:Enabled")
        && !string.IsNullOrWhiteSpace(config["Recovery:Smtp:Host"])
        && int.TryParse(config["Recovery:Smtp:Port"], out var port) && port is > 0 and <= 65535
        && config["Recovery:Smtp:Security"] is "StartTls" or "SslOnConnect"
        && MailboxAddress.TryParse(config["Recovery:Smtp:From"], out var from) && from.Address.IndexOf('@') > 0
        && Uri.TryCreate(config["Recovery:ResetPageUrl"], UriKind.Absolute, out var url)
        && url.Scheme == "https" && string.IsNullOrEmpty(url.UserInfo) && string.IsNullOrEmpty(url.Query) && string.IsNullOrEmpty(url.Fragment)
        && (string.IsNullOrEmpty(config["Recovery:Smtp:Username"]) == string.IsNullOrEmpty(config["Recovery:Smtp:Password"]));

    public async Task SendAsync(string email, string token, CancellationToken ct)
    {
        if (!Available) throw new InvalidOperationException("Recovery delivery is unavailable.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct); deadline.CancelAfter(TimeSpan.FromSeconds(20));
        var link = config["Recovery:ResetPageUrl"] + "#email=" + Uri.EscapeDataString(email) + "&token=" + Uri.EscapeDataString(token);
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(config["Recovery:Smtp:From"]!));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Reset your Warehouse Assistant password";
        message.Body = new TextPart("plain") { Text = $"A password reset was requested for your account. Open this link within 30 minutes:\n\n{link}\n\nIf you did not request this, ignore this message. Your password has not changed." };
        using var smtp = new MailKit.Net.Smtp.SmtpClient { Timeout = 20000 };
        await smtp.ConnectAsync(config["Recovery:Smtp:Host"]!, config.GetValue<int>("Recovery:Smtp:Port"),
            config["Recovery:Smtp:Security"] == "SslOnConnect" ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls, deadline.Token);
        if (!string.IsNullOrEmpty(config["Recovery:Smtp:Username"])) await smtp.AuthenticateAsync(config["Recovery:Smtp:Username"]!, config["Recovery:Smtp:Password"]!, deadline.Token);
        await smtp.SendAsync(message, deadline.Token);
        // Acceptance precedes disconnect; a disconnect failure must not cause a duplicate send.
        try { await smtp.DisconnectAsync(true, deadline.Token); } catch (Exception) { }
    }
}
public class RecoveryMailWorker(IServiceScopeFactory scopes, ILogger<RecoveryMailWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { using var scope = scopes.CreateScope(); await scope.ServiceProvider.GetRequiredService<PasswordRecoveryService>().DispatchAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception) { logger.LogWarning("Password recovery queue could not be processed."); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }
}
