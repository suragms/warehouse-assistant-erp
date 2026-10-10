using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PurchaseAssistant.Domain.Entities;

namespace PurchaseAssistant.Infrastructure.Data.Configurations;
public class PasswordRecoveryConfiguration : IEntityTypeConfiguration<PasswordRecovery>
{
    public void Configure(EntityTypeBuilder<PasswordRecovery> builder)
    {
        builder.ToTable("PasswordRecoveries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Email).HasMaxLength(255);
        builder.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Property(x => x.TokenDigest).HasMaxLength(64);
        builder.Property(x => x.PasswordDigest).HasMaxLength(64);
        builder.Property(x => x.ProtectedToken).HasMaxLength(2048);
        builder.Property(x => x.DeliveryStatus).HasMaxLength(24);
        builder.Property(x => x.ConsumedAt).IsConcurrencyToken();
        builder.HasIndex(x => x.TokenDigest).IsUnique();
        builder.HasIndex(x => new { x.UserId, x.CreatedAt });
        builder.HasIndex(x => new { x.DeliveryStatus, x.CreatedAt });
    }
}
