using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
namespace PurchaseAssistant.Infrastructure.Services.Backups;

// Independently authenticated 1 MiB chunks, including a terminal record. No whole-database buffering.
public static class BackupEncryption
{
    private static readonly byte[] Magic = "WABK0001"u8.ToArray();
    private const int Block = 1024 * 1024;
    public static async Task EncryptAsync(Stream input, Stream output, string keyId, byte[] masterKey, CancellationToken ct)
    {
        if (masterKey.Length != 32 || keyId.Length is < 1 or > 64 || keyId.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) throw new ArgumentException("Invalid backup key.");
        var id = Encoding.ASCII.GetBytes(keyId); var salt = RandomNumberGenerator.GetBytes(16);
        var header = Magic.Concat(new[] { (byte)id.Length }).Concat(id).Concat(salt).ToArray();
        await output.WriteAsync(header, ct);
        var key = HMACSHA256.HashData(masterKey, salt);
        try
        {
            using var aes = new AesGcm(key, 16); uint sequence = 0; var plain = new byte[Block];
            while (true)
            {
                var length = 0;
                while (length < Block) { var read = await input.ReadAsync(plain.AsMemory(length), ct); if (read == 0) break; length += read; }
                var nonce = new byte[12]; BinaryPrimitives.WriteUInt32BigEndian(nonce.AsSpan(8), sequence);
                var size = new byte[4]; BinaryPrimitives.WriteInt32BigEndian(size, length);
                var aad = header.Concat(nonce).Concat(size).ToArray(); var cipher = new byte[length]; var tag = new byte[16];
                aes.Encrypt(nonce, plain.AsSpan(0, length), cipher, tag, aad);
                await output.WriteAsync(size, ct); await output.WriteAsync(cipher, ct); await output.WriteAsync(tag, ct);
                if (length == 0) break;
                sequence = checked(sequence + 1);
            }
            CryptographicOperations.ZeroMemory(plain);
        }
        finally { CryptographicOperations.ZeroMemory(key); }
    }
    public static async Task DecryptAsync(Stream input, Stream output, Func<string, byte[]> keyResolver, CancellationToken ct)
    {
        var prefix = new byte[9]; await input.ReadExactlyAsync(prefix, ct);
        if (!prefix.AsSpan(0, 8).SequenceEqual(Magic) || prefix[8] is < 1 or > 64) throw new InvalidDataException("Unsupported backup envelope.");
        var suffix = new byte[prefix[8] + 16]; await input.ReadExactlyAsync(suffix, ct);
        var master = keyResolver(Encoding.ASCII.GetString(suffix, 0, prefix[8]));
        if (master.Length != 32) throw new InvalidDataException("Backup key unavailable.");
        var header = prefix.Concat(suffix).ToArray(); var key = HMACSHA256.HashData(master, suffix.AsSpan(prefix[8], 16));
        try
        {
            using var aes = new AesGcm(key, 16); uint sequence = 0;
            while (true)
            {
                var size = new byte[4]; await input.ReadExactlyAsync(size, ct); var length = BinaryPrimitives.ReadInt32BigEndian(size);
                if (length is < 0 or > Block) throw new InvalidDataException("Invalid backup record.");
                var cipher = new byte[length]; var plain = new byte[length]; var tag = new byte[16];
                await input.ReadExactlyAsync(cipher, ct); await input.ReadExactlyAsync(tag, ct);
                var nonce = new byte[12]; BinaryPrimitives.WriteUInt32BigEndian(nonce.AsSpan(8), sequence);
                aes.Decrypt(nonce, cipher, tag, plain, header.Concat(nonce).Concat(size).ToArray());
                await output.WriteAsync(plain, ct); CryptographicOperations.ZeroMemory(plain);
                if (length == 0) { if (input.ReadByte() != -1) throw new InvalidDataException("Unexpected backup suffix."); break; }
                sequence = checked(sequence + 1);
            }
        }
        finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(master); }
    }
}
