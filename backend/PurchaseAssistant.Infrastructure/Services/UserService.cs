using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PurchaseAssistant.Application.DTOs.Users;
using PurchaseAssistant.Application.Interfaces;
using PurchaseAssistant.Infrastructure.Data;
using PurchaseAssistant.Domain.Entities;
using BCrypt.Net;
using System.Text.Json;
using PurchaseAssistant.Domain.Constants;

namespace PurchaseAssistant.Infrastructure.Services
{
    public class UserService : IUserService
    {
        private readonly AppDbContext _context;
        private readonly ICurrentUserService _currentUser;

        public UserService(AppDbContext context, ICurrentUserService currentUser)
        {
            _context = context;
            _currentUser = currentUser;
        }

        public async Task<IEnumerable<UserDto>> GetAllUsersAsync()
        {
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var memberships = await _context.Memberships
                .AsNoTracking()
                .Where(m => m.BusinessId == businessId)
                .Include(m => m.User)
                .ToListAsync();

            return memberships.Select(m => new UserDto
            {
                Id = m.User.Id,
                Name = m.User.Name,
                Email = m.User.Email,
                Status = m.User.Status,
                Role = m.Role,
                CreatedAt = m.User.CreatedAt
            });
        }

        public async Task<UserDto?> GetUserByIdAsync(Guid id)
        {
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var membership = await _context.Memberships
                .AsNoTracking()
                .Include(m => m.User)
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == id);

            if (membership == null) return null;

            return new UserDto
            {
                Id = membership.User.Id,
                Name = membership.User.Name,
                Email = membership.User.Email,
                Status = membership.User.Status,
                Role = membership.Role,
                CreatedAt = membership.User.CreatedAt
            };
        }

        public async Task<UserDto> CreateUserAsync(CreateUserDto createUserDto)
        {
            ValidateRole(createUserDto.Role);
            RequireUserAdministrator();

            ValidateProfile(createUserDto.Name, createUserDto.Email);
            if (string.IsNullOrWhiteSpace(createUserDto.Password) || createUserDto.Password.Length < 8
                || System.Text.Encoding.UTF8.GetByteCount(createUserDto.Password) > 72)
                throw new ArgumentException("Password must have at least 8 characters and at most 72 UTF-8 bytes.");
            createUserDto.Email = createUserDto.Email.Trim().ToLowerInvariant();
            createUserDto.Name = createUserDto.Name.Trim();
            var businessId = _currentUser.BusinessId!.Value;
            if (!await _context.Businesses.AnyAsync(b => b.Id == businessId && b.IsActive))
                throw new UnauthorizedAccessException("Select an active business.");

            // Check if user already exists globally by email
            var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == createUserDto.Email);
            User user;

            if (existingUser != null)
            {
                throw new DbUpdateConcurrencyException("Email is already registered.");
            }
            else
            {
                var passwordHash = BCrypt.Net.BCrypt.HashPassword(createUserDto.Password);
                user = new User
                {
                    Id = Guid.NewGuid(),
                    Name = createUserDto.Name,
                    Email = createUserDto.Email,
                    PasswordHash = passwordHash,
                    Status = Domain.Enums.UserStatus.Active,
                    CreatedAt = DateTime.UtcNow
                };
                _context.Users.Add(user);
            }

            // Check if membership already exists for this business
            var existingMembership = await _context.Memberships
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == user.Id);

            if (existingMembership == null)
            {
                var membership = new Membership
                {
                    Id = Guid.NewGuid(),
                    BusinessId = businessId,
                    UserId = user.Id,
                    Role = createUserDto.Role,
                    PermissionsJson = JsonSerializer.Serialize(Permissions.ForRole(createUserDto.Role))
                };
                _context.Memberships.Add(membership);
            }
            else
            {
                ValidateProtectedMembership(existingMembership);
                if (user.Id == _currentUser.UserId && existingMembership.Role != createUserDto.Role)
                    throw new UnauthorizedAccessException("You cannot change your own role.");
                if (existingMembership.Role != createUserDto.Role)
                    existingMembership.PermissionsJson = JsonSerializer.Serialize(Permissions.ForRole(createUserDto.Role));
                existingMembership.Role = createUserDto.Role;
            }

            await _context.SaveChangesAsync();

            return new UserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                Status = user.Status,
                Role = createUserDto.Role,
                CreatedAt = user.CreatedAt
            };
        }

        public async Task<bool> UpdateUserAsync(Guid id, UpdateUserDto updateUserDto)
        {
            RequireUserAdministrator();
            ValidateProfile(updateUserDto.Name, updateUserDto.Email);
            if (updateUserDto.Status is not (Domain.Enums.UserStatus.Active or Domain.Enums.UserStatus.Inactive or Domain.Enums.UserStatus.Blocked))
                throw new ArgumentException("Invalid account status.");
            updateUserDto.Name = updateUserDto.Name.Trim();
            updateUserDto.Email = updateUserDto.Email.Trim().ToLowerInvariant();
            if (await _context.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == updateUserDto.Email))
                throw new DbUpdateConcurrencyException("Email is already registered.");
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var membership = await _context.Memberships
                .Include(m => m.User)
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == id);

            if (membership == null) return false;

            ValidateRole(updateUserDto.Role);
            ValidateProtectedMembership(membership);
            if (id == _currentUser.UserId && (membership.Role != updateUserDto.Role || membership.User.Status != updateUserDto.Status))
                throw new UnauthorizedAccessException("You cannot change your own role or account status.");
            if (await _context.Memberships.AnyAsync(m => m.UserId == id && m.BusinessId != businessId)
                && (membership.User.Name != updateUserDto.Name || membership.User.Email != updateUserDto.Email || membership.User.Status != updateUserDto.Status))
                throw new UnauthorizedAccessException("Shared account details cannot be changed from a single business.");

            membership.User.Name = updateUserDto.Name;
            membership.User.Email = updateUserDto.Email;
            membership.User.Status = updateUserDto.Status;
            if (membership.Role != updateUserDto.Role)
                membership.PermissionsJson = JsonSerializer.Serialize(Permissions.ForRole(updateUserDto.Role));
            membership.Role = updateUserDto.Role;

            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> DeleteUserAsync(Guid id)
        {
            RequireUserAdministrator();
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var membership = await _context.Memberships
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == id);

            if (membership == null) return false;

            ValidateProtectedMembership(membership);
            if (id == _currentUser.UserId)
                throw new UnauthorizedAccessException("You cannot remove your own business membership.");

            _context.Memberships.Remove(membership);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<UserPermissionsDto?> GetPermissionsAsync(Guid userId)
        {
            RequireUserAdministrator();
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var membership = await _context.Memberships
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == userId);

            if (membership == null) return null;

            var current = string.IsNullOrWhiteSpace(membership.PermissionsJson)
                ? Permissions.ForRole(membership.Role)
                : JsonSerializer.Deserialize<string[]>(membership.PermissionsJson) ?? Permissions.ForRole(membership.Role);

            return new Application.DTOs.Users.UserPermissionsDto
            {
                Permissions = current.ToList(),
                DefaultPermissions = Permissions.ForRole(membership.Role).ToList()
            };
        }

        public async Task<bool> PatchPermissionsAsync(Guid userId, Application.DTOs.Users.PatchPermissionsDto patch)
        {
            RequireUserAdministrator();
            var businessId = _currentUser.BusinessId ?? Guid.Empty;
            var membership = await _context.Memberships
                .FirstOrDefaultAsync(m => m.BusinessId == businessId && m.UserId == userId);

            if (membership == null) return false;
            ValidateProtectedMembership(membership);
            if (userId == _currentUser.UserId)
                throw new UnauthorizedAccessException("You cannot change your own permissions.");

            var allKnown = typeof(Permissions).GetFields()
                .Where(f => f.IsLiteral && f.FieldType == typeof(string))
                .Select(f => (string)f.GetRawConstantValue()!)
                .ToHashSet();

            var current = string.IsNullOrWhiteSpace(membership.PermissionsJson)
                ? Permissions.ForRole(membership.Role).ToHashSet()
                : (JsonSerializer.Deserialize<string[]>(membership.PermissionsJson) ?? Permissions.ForRole(membership.Role)).ToHashSet();

            foreach (var p in patch.Grant ?? [])
            {
                if (!allKnown.Contains(p))
                    throw new ArgumentException($"Unknown permission: {p}");
                if (_currentUser.Role == "Manager" && (!_currentUser.HasPermission(p) || p is Permissions.UsersManage or Permissions.UsersView or Permissions.RolesManage or Permissions.SettingsManage or Permissions.ProvidersManage))
                    throw new UnauthorizedAccessException("Managers cannot grant privileged permissions.");
                current.Add(p);
            }
            foreach (var p in patch.Revoke ?? [])
            {
                if (!allKnown.Contains(p))
                    throw new ArgumentException($"Unknown permission: {p}");
                current.Remove(p);
            }

            membership.PermissionsJson = JsonSerializer.Serialize(current.ToArray());
            await _context.SaveChangesAsync();
            return true;
        }

        private void ValidateRole(Domain.Enums.Role role)
        {
            if (!Enum.IsDefined(role) || role == Domain.Enums.Role.SuperAdmin)
                throw new ArgumentException("This role cannot be assigned by business user management.");

            // Managers can only create Staff
            var isPrivileged = _currentUser.Role is "Owner" or "Admin" or "SuperAdmin";
            if (!isPrivileged && role != Domain.Enums.Role.Staff)
                throw new UnauthorizedAccessException("Owners and Managers can only assign the Staff role.");

            if (role == Domain.Enums.Role.Owner && _currentUser.Role is not ("Admin" or "SuperAdmin"))
                throw new ArgumentException("Only an administrator can assign an Owner membership.");
        }

        private void RequireUserAdministrator()
        {
            if (_currentUser.BusinessId == null || _currentUser.UserId == null
                || _currentUser.Role is not ("Owner" or "Admin" or "Manager" or "SuperAdmin")
                || !(_currentUser.HasPermission(Domain.Constants.Permissions.UsersManage) || _currentUser.Role is "Owner" or "Admin" or "SuperAdmin"))
                throw new UnauthorizedAccessException("You do not have permission to manage users.");
        }

        private static void ValidateProfile(string name, string email)
        {
            if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 150
                || string.IsNullOrWhiteSpace(email) || email.Trim().Length > 255
                || !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email.Trim()))
                throw new ArgumentException("A name and a valid email address are required.");
        }

        private void ValidateProtectedMembership(Membership membership)
        {
            if (_currentUser.Role == "Manager" && membership.Role != Domain.Enums.Role.Staff)
                throw new UnauthorizedAccessException("Managers can manage only Staff memberships.");
            if (_currentUser.Role == "Owner" && membership.Role != Domain.Enums.Role.Staff)
                throw new UnauthorizedAccessException("Owners can manage only Staff memberships.");
            if (membership.Role == Domain.Enums.Role.SuperAdmin || (membership.Role == Domain.Enums.Role.Owner && _currentUser.Role is not ("Admin" or "SuperAdmin")))
                throw new UnauthorizedAccessException("You cannot modify this privileged membership.");
        }
    }
}
