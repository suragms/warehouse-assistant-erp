using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Auth;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Contracts.Responses;
using PurchaseAssistant.Domain.Entities;
using PurchaseAssistant.Domain.Enums;
using PurchaseAssistant.Infrastructure.Data;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace PurchaseAssistant.Web.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IPasswordHasher _passwordHasher;
        private readonly IJwtProvider _jwtProvider;
        private readonly ICurrentUserService _currentUser;

        public AuthController(
            AppDbContext db,
            IPasswordHasher passwordHasher,
            IJwtProvider jwtProvider,
            ICurrentUserService currentUser)
        {
            _db = db;
            _passwordHasher = passwordHasher;
            _jwtProvider = jwtProvider;
            _currentUser = currentUser;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var user = await _db.Users
                .Include(u => u.Memberships)
                .ThenInclude(m => m.Business)
                .FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

            if (user == null || !_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
            {
                await LogSecurityEvent(null, null, "LOGIN_FAILED", $"Failed login attempt for {normalizedEmail}");
                return Unauthorized(new { error = new { code = "INVALID_CREDENTIALS", message = "Invalid email or password." } });
            }

            if (user.Status != UserStatus.Active)
            {
                await LogSecurityEvent(null, user.Id, "LOGIN_BLOCKED", $"Blocked login for status {user.Status}");
                return StatusCode(StatusCodes.Status403Forbidden, new { error = new { code = "ACCOUNT_INACTIVE", message = $"Account is {user.Status}." } });
            }

            var activeMembership = user.Memberships.FirstOrDefault(m => m.Business.IsActive);
            var refreshTokenString = _jwtProvider.GenerateRandomToken();
            var refreshTokenHash = _passwordHasher.HashPassword(refreshTokenString);

            var rt = new RefreshToken
            {
                UserId = user.Id,
                TokenHash = refreshTokenHash,
                TokenDigest = Digest(refreshTokenString),
                ExpiresAt = DateTime.UtcNow.AddDays(7),
                CreatedByIp = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Request.Headers.UserAgent.ToString()
            };

            _db.RefreshTokens.Add(rt);
            await _db.SaveChangesAsync();
            // A concurrent recovery may finish between password verification and session creation.
            if (!await _db.Users.AsNoTracking().AnyAsync(x => x.Id == user.Id && x.PasswordHash == user.PasswordHash && x.Status == UserStatus.Active))
            {
                rt.RevokedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return Unauthorized(new { error = new { code = "INVALID_CREDENTIALS", message = "Credentials changed. Sign in again." } });
            }
            var token = _jwtProvider.GenerateAccessToken(user, activeMembership, rt.FamilyId);

            SetRefreshTokenCookie($"{user.Id}:{refreshTokenString}:{activeMembership?.BusinessId}");
            await LogSecurityEvent(activeMembership?.BusinessId, user.Id, "LOGIN_SUCCESS", $"User {user.Email} logged in successfully");

            var permissions = new List<string>();
            if (activeMembership != null && !string.IsNullOrEmpty(activeMembership.PermissionsJson))
            {
                try { permissions = JsonSerializer.Deserialize<List<string>>(activeMembership.PermissionsJson) ?? new(); } catch { }
            }

            var response = new AuthResponse
            {
                AccessToken = token,
                ExpiresAt = new DateTimeOffset(DateTime.UtcNow.AddMinutes(15)).ToUnixTimeSeconds(),
                User = new UserDto
                {
                    Id = user.Id,
                    Name = user.Name,
                    Email = user.Email,
                    CurrentBusiness = activeMembership != null ? new BusinessContextDto
                    {
                        BusinessId = activeMembership.BusinessId,
                        BusinessName = activeMembership.Business.Name,
                        Role = activeMembership.Role.ToString(),
                        Permissions = permissions
                    } : null,
                    Businesses = user.Memberships.Select(m => new BusinessSummaryDto
                    {
                        BusinessId = m.BusinessId,
                        BusinessName = m.Business.Name,
                        Role = m.Role.ToString()
                    }).ToList()
                }
            };

            return Ok(new ApiResponse<AuthResponse>(response));
        }

        [HttpPost("refresh")]
        [AllowAnonymous]
        public async Task<IActionResult> Refresh()
        {
            var cookie = Request.Cookies["refreshToken"];
            if (string.IsNullOrEmpty(cookie))
            {
                return Unauthorized(new { error = new { code = "AUTH_REQUIRED", message = "Refresh token is missing." } });
            }

            var parts = cookie.Split(':', 3);
            if (parts.Length < 2 || !Guid.TryParse(parts[0], out var userId))
            {
                return Unauthorized(new { error = new { code = "INVALID_TOKEN", message = "Malformed refresh cookie." } });
            }

            var tokenRaw = parts[1];
            var matched = await FindRefreshTokenAsync(userId, tokenRaw);
            if (matched == null || matched.ExpiresAt <= DateTime.UtcNow)
                return Unauthorized(new { error = new { code = "INVALID_TOKEN", message = "Refresh token is invalid." } });
            if (matched.RevokedAt != null)
            {
                // A verified replay revokes only its session family; arbitrary cookies cannot revoke sessions.
                var staleTokens = await _db.RefreshTokens.Where(t => t.UserId == userId && t.FamilyId == matched.FamilyId && t.RevokedAt == null).ToListAsync();
                foreach (var t in staleTokens)
                {
                    t.RevokedAt = DateTime.UtcNow;
                    t.RevokedByIp = HttpContext.Connection.RemoteIpAddress?.ToString();
                }
                await _db.SaveChangesAsync();
                await LogSecurityEvent(null, userId, "REFRESH_TOKEN_REUSE_DETECTED", "Revoked the session family due to verified token reuse.");

                return Unauthorized(new { error = new { code = "REFRESH_TOKEN_REUSE", message = "Security violation: session invalidated." } });
            }

            matched.RevokedAt = DateTime.UtcNow;
            matched.RevokedByIp = HttpContext.Connection.RemoteIpAddress?.ToString();

            var user = await _db.Users
                .Include(u => u.Memberships)
                .ThenInclude(m => m.Business)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null || user.Status != UserStatus.Active)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = new { code = "ACCOUNT_INACTIVE", message = "Account is inactive or blocked." } });
            }

            var selectedBusiness = parts.Length == 3 && Guid.TryParse(parts[2], out var selectedId) ? (Guid?)selectedId : null;
            var activeMembership = selectedBusiness.HasValue
                ? user.Memberships.FirstOrDefault(m => m.BusinessId == selectedBusiness && m.Business.IsActive)
                : user.Memberships.FirstOrDefault(m => m.Business.IsActive);
            if (selectedBusiness.HasValue && activeMembership == null)
                return StatusCode(403, new { error = new { code = "BUSINESS_ACCESS_DENIED", message = "This business membership is no longer active." } });
            var newAccessToken = _jwtProvider.GenerateAccessToken(user, activeMembership, matched.FamilyId);
            var newRfString = _jwtProvider.GenerateRandomToken();
            var newRfHash = _passwordHasher.HashPassword(newRfString);

            var newRf = new RefreshToken
            {
                UserId = user.Id,
                FamilyId = matched.FamilyId,
                TokenHash = newRfHash,
                TokenDigest = Digest(newRfString),
                ExpiresAt = DateTime.UtcNow.AddDays(7),
                CreatedByIp = HttpContext.Connection.RemoteIpAddress?.ToString(),
                UserAgent = Request.Headers.UserAgent.ToString(),
                ReplacedByTokenId = matched.Id
            };

            _db.RefreshTokens.Add(newRf);
            try { await _db.SaveChangesAsync(); }
            catch (DbUpdateConcurrencyException)
            {
                return Conflict(new { error = new { code = "REFRESH_CONFLICT", message = "This session was already refreshed. Retry using the current session." } });
            }

            SetRefreshTokenCookie($"{user.Id}:{newRfString}:{activeMembership?.BusinessId}");

            var permissions = new List<string>();
            if (activeMembership != null && !string.IsNullOrEmpty(activeMembership.PermissionsJson))
            {
                try { permissions = JsonSerializer.Deserialize<List<string>>(activeMembership.PermissionsJson) ?? new(); } catch { }
            }

            return Ok(new ApiResponse<AuthResponse>(new AuthResponse
            {
                AccessToken = newAccessToken,
                ExpiresAt = new DateTimeOffset(DateTime.UtcNow.AddMinutes(15)).ToUnixTimeSeconds(),
                User = new UserDto
                {
                    Id = user.Id,
                    Name = user.Name,
                    Email = user.Email,
                    CurrentBusiness = activeMembership != null ? new BusinessContextDto
                    {
                        BusinessId = activeMembership.BusinessId,
                        BusinessName = activeMembership.Business.Name,
                        Role = activeMembership.Role.ToString(),
                        Permissions = permissions
                    } : null,
                    Businesses = user.Memberships.Select(m => new BusinessSummaryDto
                    {
                        BusinessId = m.BusinessId,
                        BusinessName = m.Business.Name,
                        Role = m.Role.ToString()
                    }).ToList()
                }
            }));
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetCurrentUser()
        {
            if (!_currentUser.UserId.HasValue) return Unauthorized();

            var user = await _db.Users
                .Include(u => u.Memberships)
                .ThenInclude(m => m.Business)
                .FirstOrDefaultAsync(u => u.Id == _currentUser.UserId.Value);

            if (user == null) return NotFound(new { error = new { code = "USER_NOT_FOUND", message = "User not found." } });

            var currentBusinessId = _currentUser.BusinessId;
            var activeMembership = user.Memberships.FirstOrDefault(m => m.BusinessId == currentBusinessId)
                                  ?? user.Memberships.FirstOrDefault();

            var permissions = new List<string>();
            if (activeMembership != null && !string.IsNullOrEmpty(activeMembership.PermissionsJson))
            {
                try { permissions = JsonSerializer.Deserialize<List<string>>(activeMembership.PermissionsJson) ?? new(); } catch { }
            }

            var dto = new UserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                CurrentBusiness = activeMembership != null ? new BusinessContextDto
                {
                    BusinessId = activeMembership.BusinessId,
                    BusinessName = activeMembership.Business.Name,
                    Role = activeMembership.Role.ToString(),
                    Permissions = permissions
                } : null,
                Businesses = user.Memberships.Select(m => new BusinessSummaryDto
                {
                    BusinessId = m.BusinessId,
                    BusinessName = m.Business.Name,
                    Role = m.Role.ToString()
                }).ToList()
            };

            return Ok(new ApiResponse<UserDto>(dto));
        }

        [HttpPost("select-business")]
        [Authorize]
        public async Task<IActionResult> SelectBusiness([FromBody] SelectBusinessRequest request)
        {
            if (!_currentUser.UserId.HasValue) return Unauthorized();

            var user = await _db.Users
                .Include(u => u.Memberships)
                .ThenInclude(m => m.Business)
                .FirstOrDefaultAsync(u => u.Id == _currentUser.UserId.Value);

            if (user == null) return NotFound();

            var targetMembership = user.Memberships.FirstOrDefault(m => m.BusinessId == request.BusinessId && m.Business.IsActive);
            if (targetMembership == null)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = new { code = "BUSINESS_ACCESS_DENIED", message = "You do not belong to this business." } });
            }

            var refreshCookie = Request.Cookies["refreshToken"]?.Split(':', 3);
            if (refreshCookie?.Length >= 2 && Guid.TryParse(refreshCookie[0], out var cookieUserId) && cookieUserId == user.Id)
                SetRefreshTokenCookie($"{user.Id}:{refreshCookie[1]}:{targetMembership.BusinessId}");
            var newAccessToken = _jwtProvider.GenerateAccessToken(user, targetMembership, Guid.Parse(User.FindFirstValue("sessionId")!));
            await LogSecurityEvent(targetMembership.BusinessId, user.Id, "BUSINESS_SWITCHED", $"User switched active context to business {targetMembership.Business.Name}");

            var permissions = new List<string>();
            if (!string.IsNullOrEmpty(targetMembership.PermissionsJson))
            {
                try { permissions = JsonSerializer.Deserialize<List<string>>(targetMembership.PermissionsJson) ?? new(); } catch { }
            }

            return Ok(new ApiResponse<AuthResponse>(new AuthResponse
            {
                AccessToken = newAccessToken,
                ExpiresAt = new DateTimeOffset(DateTime.UtcNow.AddMinutes(15)).ToUnixTimeSeconds(),
                User = new UserDto
                {
                    Id = user.Id,
                    Name = user.Name,
                    Email = user.Email,
                    CurrentBusiness = new BusinessContextDto
                    {
                        BusinessId = targetMembership.BusinessId,
                        BusinessName = targetMembership.Business.Name,
                        Role = targetMembership.Role.ToString(),
                        Permissions = permissions
                    },
                    Businesses = user.Memberships.Select(m => new BusinessSummaryDto
                    {
                        BusinessId = m.BusinessId,
                        BusinessName = m.Business.Name,
                        Role = m.Role.ToString()
                    }).ToList()
                }
            }));
        }

        [HttpPost("logout")]
        [Authorize]
        public async Task<IActionResult> Logout()
        {
            if (_currentUser.UserId.HasValue && Guid.TryParse(User.FindFirstValue("sessionId"), out var sessionId))
            {
                var tokens = await _db.RefreshTokens.Where(t => t.UserId == _currentUser.UserId.Value
                    && t.FamilyId == sessionId && t.RevokedAt == null).ToListAsync();
                foreach (var token in tokens)
                {
                    token.RevokedAt = DateTime.UtcNow;
                    token.RevokedByIp = HttpContext.Connection.RemoteIpAddress?.ToString();
                }
                await _db.SaveChangesAsync();
            }

            Response.Cookies.Delete("refreshToken");
            if (_currentUser.UserId.HasValue)
            {
                await LogSecurityEvent(_currentUser.BusinessId, _currentUser.UserId.Value, "LOGOUT", "User logged out");
            }
            return Ok(new ApiResponse<bool>(true));
        }

        [HttpPost("logout-all")]
        [Authorize]
        public async Task<IActionResult> LogoutAll()
        {
            if (!_currentUser.UserId.HasValue) return Unauthorized();

            var tokens = await _db.RefreshTokens
                .Where(t => t.UserId == _currentUser.UserId.Value && t.RevokedAt == null)
                .ToListAsync();

            foreach (var t in tokens)
            {
                t.RevokedAt = DateTime.UtcNow;
                t.RevokedByIp = HttpContext.Connection.RemoteIpAddress?.ToString();
            }

            await _db.SaveChangesAsync();
            Response.Cookies.Delete("refreshToken");
            await LogSecurityEvent(_currentUser.BusinessId, _currentUser.UserId.Value, "LOGOUT_ALL", "User revoked all active sessions");

            return Ok(new ApiResponse<bool>(true));
        }

        [HttpPost("forgot-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, [FromServices] PurchaseAssistant.Web.Services.PasswordRecoveryService recovery, CancellationToken ct)
        {
            Response.Headers.CacheControl = "no-store";
            if (recovery.Available) {
                await recovery.RequestAsync(request.Email, ct);
                return Accepted(new { message = "If an eligible account exists, reset instructions will be queued. Check your inbox; you may request another link if it does not arrive." });
            }
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = new {
                code = "PASSWORD_RESET_UNAVAILABLE", message = "Password reset is not configured. Contact your business owner for help." } });
        }

        [HttpPost("reset-password")]
        [AllowAnonymous]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request, [FromServices] PurchaseAssistant.Web.Services.PasswordRecoveryService recovery, CancellationToken ct)
        {
            Response.Headers.CacheControl = "no-store";
            if (recovery.Available) {
                if (!await recovery.ResetAsync(request.Email, request.Token, request.NewPassword, ct))
                    return BadRequest(new { error = new { code = "INVALID_RESET_TOKEN", message = "This reset link is invalid or expired. Request a new link." } });
                Response.Cookies.Delete("refreshToken");
                return Ok(new { message = "Password changed. Sign in again on each device." });
            }
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = new {
                code = "PASSWORD_RESET_UNAVAILABLE", message = "Password reset is not configured. Contact your business owner for help." } });
        }

        private void SetRefreshTokenCookie(string tokenValue)
        {
            var isDevelopment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development";
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Expires = DateTime.UtcNow.AddDays(7),
                Secure = !isDevelopment,
                SameSite = isDevelopment ? SameSiteMode.Lax : SameSiteMode.Strict,
                Path = "/"
            };
            Response.Cookies.Append("refreshToken", tokenValue, cookieOptions);
        }

        private static string Digest(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

        private async Task<RefreshToken?> FindRefreshTokenAsync(Guid userId, string raw)
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Length > 256) return null;
            var digest = Digest(raw);
            var indexed = await _db.RefreshTokens.SingleOrDefaultAsync(t => t.UserId == userId && t.TokenDigest == digest);
            if (indexed != null) return indexed;
            // Bounded compatibility for existing BCrypt-only cookies. New tokens always use indexed digests.
            var legacy = await _db.RefreshTokens.Where(t => t.UserId == userId && t.TokenDigest == null && t.ExpiresAt > DateTime.UtcNow)
                .OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id).Take(100).ToListAsync();
            return legacy.FirstOrDefault(t => _passwordHasher.VerifyPassword(raw, t.TokenHash));
        }

        private async Task LogSecurityEvent(Guid? businessId, Guid? userId, string eventType, string desc)
        {
            try
            {
                var log = new SecurityAuditLog
                {
                    BusinessId = businessId ?? Guid.Empty,
                    UserId = userId,
                    EventType = eventType,
                    Description = desc,
                    IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = Request.Headers.UserAgent.ToString(),
                    RequestId = HttpContext.TraceIdentifier
                };
                _db.SecurityAuditLogs.Add(log);
                await _db.SaveChangesAsync();
            }
            catch { /* non-blocking audit failure */ }
        }
    }
}
