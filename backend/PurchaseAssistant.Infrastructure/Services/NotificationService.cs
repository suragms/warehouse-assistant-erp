using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Catalog;
using PurchaseAssistant.Application.DTOs.Notifications;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace PurchaseAssistant.Infrastructure.Services
{
    public class NotificationService : INotificationService
    {
        private readonly AppDbContext _context;
        private readonly ICurrentUserService? _user;

        public NotificationService(AppDbContext context, ICurrentUserService? user = null)
        {
            _context = context;
            _user = user;
        }

        private IQueryable<Notification> Visible(Guid userId)
        {
            var query = _context.Notifications.Where(n => n.UserId == userId);
            if (_user == null || _user.Role is "Owner" or "SuperAdmin") return query;
            bool stock = _user.HasPermission("stock.view"), purchase = _user.HasPermission("purchase.view"), staff = _user.HasPermission("users.view");
            return query.Where(n => ((n.Type == NotificationType.LowStock || n.Type == NotificationType.OutOfStock || n.Type == NotificationType.StockVariance || n.ReferenceType == "MlPrediction" || n.ReferenceType == "CatalogItem") && stock)
                || (n.ReferenceType == "Membership" && staff)
                || ((n.Type == NotificationType.PurchasePending || n.Type == NotificationType.VerificationRequired || n.Type == NotificationType.DeliveryPending || n.ReferenceType == "Purchase" || n.ReferenceType == "PurchaseOrder" || n.ReferenceType == "DamageReport") && purchase)
                || (n.Type == NotificationType.System && n.ReferenceType != "MlPrediction" && n.ReferenceType != "Membership" && n.ReferenceType != "CatalogItem" && n.ReferenceType != "Purchase" && n.ReferenceType != "PurchaseOrder" && n.ReferenceType != "DamageReport"));
        }

        public async Task<PaginatedResult<NotificationDto>> GetNotificationsAsync(Guid userId, int page, int pageSize, bool onlyUnread)
        {
            page = Math.Clamp(page, 1, 10000);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var query = Visible(userId).AsNoTracking();

            if (onlyUnread)
            {
                query = query.Where(n => !n.IsRead);
            }

            var totalCount = await query.CountAsync();
            var items = await query
                .OrderByDescending(n => n.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(n => new NotificationDto
                {
                    Id = n.Id,
                    UserId = n.UserId,
                    Type = n.Type,
                    Title = n.Title,
                    Message = n.Message,
                    IsRead = n.IsRead,
                    CreatedAt = n.CreatedAt,
                    ReadAt = n.ReadAt,
                    ReferenceType = n.ReferenceType,
                    ReferenceId = n.ReferenceId
                })
                .ToListAsync();

            return new PaginatedResult<NotificationDto>
            {
                Data = items,
                Meta = new PaginationMeta
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalCount = totalCount,
                    TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
                }
            };
        }

        public async Task<int> GetUnreadCountAsync(Guid userId)
        {
            return await Visible(userId)
                .Where(n => n.UserId == userId && !n.IsRead)
                .CountAsync();
        }

        public async Task MarkAsReadAsync(Guid notificationId, Guid userId)
        {
            var notification = await Visible(userId)
                .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId);

            if (notification != null && !notification.IsRead)
            {
                notification.IsRead = true;
                notification.ReadAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        public async Task MarkAllAsReadAsync(Guid userId)
        {
            var unreadNotifications = await Visible(userId)
                .Where(n => n.UserId == userId && !n.IsRead)
                .ToListAsync();

            if (unreadNotifications.Any())
            {
                var now = DateTime.UtcNow;
                foreach (var n in unreadNotifications)
                {
                    n.IsRead = true;
                    n.ReadAt = now;
                }
                await _context.SaveChangesAsync();
            }
        }

        public async Task CreateNotificationAsync(Guid businessId, Guid userId, NotificationType type, string title, string message, string? referenceType = null, Guid? referenceId = null)
        {
            var settings = await _context.Set<UserSettings>().IgnoreQueryFilters().SingleOrDefaultAsync(s => s.BusinessId == businessId && s.UserId == userId);
            var kind = type switch { NotificationType.LowStock or NotificationType.OutOfStock => "low_stock", NotificationType.StockVariance => "stock_variance", NotificationType.DeliveryPending or NotificationType.VerificationRequired => "delivery", _ => "staff_alert" };
            if (settings != null && (!settings.NotificationsEnabled || !(System.Text.Json.JsonSerializer.Deserialize<string[]>(settings.NotificationKindsJson) ?? []).Contains(kind))) return;
            // Deduplication: prevent creating another identical Unread notification
            bool exists = await _context.Notifications
                .AnyAsync(n => n.BusinessId == businessId
                            && n.UserId == userId
                            && n.Type == type
                            && n.ReferenceId == referenceId
                            && !n.IsRead);
            if (exists)
                return;

            var notification = new Notification
            {
                BusinessId = businessId,
                DedupeKey = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{type}:{referenceType}:{referenceId}"))),
                UserId = userId,
                Type = type,
                Title = title,
                Message = message,
                ReferenceType = referenceType,
                ReferenceId = referenceId,
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };

            if (_context.Database.IsRelational()) {
                await _context.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "Notifications" ("Id", "BusinessId", "UserId", "Type", "Title", "Message", "IsRead", "CreatedAt", "ReferenceType", "ReferenceId", "DedupeKey")
                    VALUES ({notification.Id}, {businessId}, {userId}, {type.ToString()}, {title}, {message}, false, {notification.CreatedAt}, {referenceType}, {referenceId}, {notification.DedupeKey})
                    ON CONFLICT DO NOTHING
                    """);
            } else { _context.Notifications.Add(notification); await _context.SaveChangesAsync(); }
        }
    }
}
