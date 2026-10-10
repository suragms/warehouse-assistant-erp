using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Configuration;
using PurchaseAssistant.Web.Services;
using Xunit;

namespace PurchaseAssistant.UnitTests.Auth;
public class SmtpTransportTests
{
    [Fact] public async Task RequiredStartTlsRefusesPlaintextServerBeforeSendingCredentialsOrMail()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var commands = new List<string>();
        var server = Task.Run(async () => {
            using var socket = await listener.AcceptTcpClientAsync(deadline.Token);
            await using var stream = socket.GetStream(); using var reader = new StreamReader(stream);
            await using var writer = new StreamWriter(stream) { AutoFlush = true, NewLine = "\r\n" };
            await writer.WriteLineAsync("220 local-test SMTP");
            var greeting = await reader.ReadLineAsync(deadline.Token); commands.Add(greeting ?? "");
            await writer.WriteLineAsync("250 local-test");
            var next = await reader.ReadLineAsync(deadline.Token); if (next != null) commands.Add(next);
        }, deadline.Token);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Recovery:Enabled"] = "true", ["Recovery:Smtp:Host"] = "127.0.0.1", ["Recovery:Smtp:Port"] = ((IPEndPoint)listener.LocalEndpoint).Port.ToString(),
            ["Recovery:Smtp:Security"] = "StartTls", ["Recovery:Smtp:From"] = "recovery@example.test", ["Recovery:Smtp:Username"] = "fixture-user", ["Recovery:Smtp:Password"] = "fixture-password",
            ["Recovery:ResetPageUrl"] = "https://example.test/reset-password"
        }).Build();
        await Assert.ThrowsAsync<NotSupportedException>(() => new RecoveryMailSender(config).SendAsync("recipient@example.test", "fixture-token", deadline.Token));
        await server;
        Assert.StartsWith("EHLO", commands[0]); Assert.DoesNotContain(commands, x => x.StartsWith("AUTH") || x.StartsWith("MAIL") || x.Contains("fixture-password"));
    }
}
