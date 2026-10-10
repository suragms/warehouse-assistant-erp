namespace PurchaseAssistant.Application.DTOs.Catalog;

public sealed class BarcodeAssignmentDto
{
    // Explicit null clears the mapping; the version is mandatory for every mutation.
    [System.Text.Json.Serialization.JsonRequired]
    public string? Barcode { get; set; }
    public Guid ExpectedVersion { get; set; }
}

public sealed class GenerateBarcodeDto
{
    public Guid ExpectedVersion { get; set; }
}
