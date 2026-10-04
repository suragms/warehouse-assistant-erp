using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PurchaseAssistant.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase4HistoricalConsumption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HistoricalUsageBatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedById = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Source = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RawCsv = table.Column<string>(type: "text", nullable: false),
                    RowCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BusinessId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistoricalUsageBatches", x => x.Id);
                    table.UniqueConstraint("AK_HistoricalUsageBatches_BusinessId_Id", x => new { x.BusinessId, x.Id });
                    table.ForeignKey(
                        name: "FK_HistoricalUsageBatches_Businesses_BusinessId",
                        column: x => x.BusinessId,
                        principalTable: "Businesses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HistoricalUsageRows",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    CatalogItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,4)", precision: 20, scale: 4, nullable: false),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SourceRecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BusinessId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistoricalUsageRows", x => x.Id);
                    table.CheckConstraint("CK_HistoricalUsage_Quantity", "\"Quantity\" >= 0 AND \"Quantity\" <= 1000000000");
                    table.ForeignKey(
                        name: "FK_HistoricalUsageRows_CatalogItems_BusinessId_CatalogItemId",
                        columns: x => new { x.BusinessId, x.CatalogItemId },
                        principalTable: "CatalogItems",
                        principalColumns: new[] { "BusinessId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HistoricalUsageRows_HistoricalUsageBatches_BusinessId_Batch~",
                        columns: x => new { x.BusinessId, x.BatchId },
                        principalTable: "HistoricalUsageBatches",
                        principalColumns: new[] { "BusinessId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HistoricalUsageBatches_BusinessId_FileHash",
                table: "HistoricalUsageBatches",
                columns: new[] { "BusinessId", "FileHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HistoricalUsageRows_BusinessId_BatchId",
                table: "HistoricalUsageRows",
                columns: new[] { "BusinessId", "BatchId" });

            migrationBuilder.CreateIndex(
                name: "IX_HistoricalUsageRows_BusinessId_CatalogItemId_Date",
                table: "HistoricalUsageRows",
                columns: new[] { "BusinessId", "CatalogItemId", "Date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HistoricalUsageRows");

            migrationBuilder.DropTable(
                name: "HistoricalUsageBatches");
        }
    }
}
