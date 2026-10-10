using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PurchaseAssistant.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDatabaseBackupJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DatabaseBackupEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    JobId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DatabaseBackupEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DatabaseBackupJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Stage = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ScheduleKey = table.Column<string>(type: "character varying(48)", maxLength: 48, nullable: true),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LeaseUntil = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RetryAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ErrorCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Pinned = table.Column<bool>(type: "boolean", nullable: false),
                    OffsiteVerified = table.Column<bool>(type: "boolean", nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Revision = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DatabaseBackupJobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DatabaseBackupSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    DailyEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    DailyHour = table.Column<int>(type: "integer", nullable: false),
                    DailyMinute = table.Column<int>(type: "integer", nullable: false),
                    MonthlyEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    MonthlyDay = table.Column<int>(type: "integer", nullable: false),
                    MonthlyHour = table.Column<int>(type: "integer", nullable: false),
                    MonthlyMinute = table.Column<int>(type: "integer", nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DailyRetention = table.Column<int>(type: "integer", nullable: false),
                    MonthlyRetention = table.Column<int>(type: "integer", nullable: false),
                    ManualRetention = table.Column<int>(type: "integer", nullable: false),
                    Revision = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DatabaseBackupSettings", x => x.Id);
                    table.CheckConstraint("CK_DatabaseBackupSettings_Valid", "\"Id\" = 1 AND \"DailyHour\" BETWEEN 0 AND 23 AND \"DailyMinute\" BETWEEN 0 AND 59 AND \"MonthlyDay\" BETWEEN 1 AND 31 AND \"MonthlyHour\" BETWEEN 0 AND 23 AND \"MonthlyMinute\" BETWEEN 0 AND 59 AND \"DailyRetention\" BETWEEN 1 AND 365 AND \"MonthlyRetention\" BETWEEN 1 AND 120 AND \"ManualRetention\" BETWEEN 1 AND 365");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DatabaseBackupEvents_CreatedAt",
                table: "DatabaseBackupEvents",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_DatabaseBackupJobs_ScheduleKey",
                table: "DatabaseBackupJobs",
                column: "ScheduleKey",
                unique: true,
                filter: "\"ScheduleKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DatabaseBackupJobs_Status_CreatedAt",
                table: "DatabaseBackupJobs",
                columns: new[] { "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DatabaseBackupEvents");

            migrationBuilder.DropTable(
                name: "DatabaseBackupJobs");

            migrationBuilder.DropTable(
                name: "DatabaseBackupSettings");
        }
    }
}
