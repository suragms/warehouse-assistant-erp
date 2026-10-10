using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace PurchaseAssistant.Application.DTOs.Auth
{
    public class BusinessSummaryDto
    {
        public Guid BusinessId { get; set; }
        public string BusinessName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
    }

    public class ForgotPasswordRequest
    {
        [Required, EmailAddress, MaxLength(255)]
        public string Email { get; set; } = string.Empty;
    }

    public class ResetPasswordRequest
    {
        [Required, EmailAddress, MaxLength(255)]
        public string Email { get; set; } = string.Empty;

        [Required, MaxLength(256)]
        public string Token { get; set; } = string.Empty;

        [Required, MaxLength(128)]
        public string NewPassword { get; set; } = string.Empty;
    }
}
