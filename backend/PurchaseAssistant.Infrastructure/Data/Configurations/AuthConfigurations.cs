using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PurchaseAssistant.Domain.Entities;

namespace PurchaseAssistant.Infrastructure.Data.Configurations
{
    public class UserConfiguration : IEntityTypeConfiguration<User>
    {
        public void Configure(EntityTypeBuilder<User> builder)
        {
            builder.HasKey(e => e.Id);
            builder.Property(e => e.Name).IsRequired().HasMaxLength(150);
            builder.Property(e => e.Email).IsRequired().HasMaxLength(255);
            builder.Property(e => e.PasswordHash).IsConcurrencyToken();

            // Note: EF Core makes it easy to add unique index
            builder.HasIndex(e => e.Email).IsUnique();
        }
    }

    public class MembershipConfiguration : IEntityTypeConfiguration<Membership>
    {
        public void Configure(EntityTypeBuilder<Membership> builder)
        {
            builder.HasKey(e => e.Id);
            builder.HasIndex(e => new { e.BusinessId, e.UserId }).IsUnique();
        }
    }

    public class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
    {
        public void Configure(EntityTypeBuilder<RefreshToken> builder)
        {
            builder.HasKey(e => e.Id);
            builder.Property(e => e.TokenHash).IsRequired().HasMaxLength(255);
            builder.Property(e => e.FamilyId).HasDefaultValueSql("gen_random_uuid()");
            builder.Property(e => e.TokenDigest).HasMaxLength(64);
            builder.Property(e => e.RevokedAt).IsConcurrencyToken();
            builder.HasIndex(e => e.UserId);
            builder.HasIndex(e => new { e.UserId, e.TokenDigest }).IsUnique();
            builder.HasIndex(e => new { e.UserId, e.FamilyId, e.RevokedAt });
        }
    }
}
