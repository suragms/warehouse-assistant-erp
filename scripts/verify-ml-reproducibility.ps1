param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repository ('TestResults/ml-repro-' + [Guid]::NewGuid().ToString('N')) }
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Choose a new output directory; this check does not overwrite existing artifacts.' }
[System.IO.Directory]::CreateDirectory($output) | Out-Null
$business = '11111111-1111-1111-1111-111111111111'
$item = '22222222-2222-2222-2222-222222222222'
$asOf = [datetime]::Parse('2026-10-03T00:00:00Z').ToUniversalTime()
$rows = @(0..179 | ForEach-Object {
    $date = $asOf.AddDays($_ - 180)
    @{ Date = $date.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture); Quantity = 20 + .15 * $_ + 2 * [int]$date.DayOfWeek; Confirmed = $true; RecordedAt = $date.AddHours(23).ToString('O', [Globalization.CultureInfo]::InvariantCulture) }
})
$dataset = @{ BusinessId = $business; ExtractedAt = $asOf.ToString('O', [Globalization.CultureInfo]::InvariantCulture); Items = @(@{ ItemId = $item; Unit = 'KG'; Observations = $rows }) }
$datasetPath = Join-Path $output 'SYNTHETIC-VERIFICATION-ONLY.json'
[System.IO.File]::WriteAllText($datasetPath, ($dataset | ConvertTo-Json -Depth 8))
$artifacts = @()
Push-Location $repository
try {
    foreach ($run in @('first','second')) {
        $destination = Join-Path $output $run
        & dotnet run --project ml/PurchaseAssistant.ML.Tool --configuration Release -- train $datasetPath $destination
        if ($LASTEXITCODE -ne 0) { throw "Training failed on $run run." }
        $file = Join-Path $destination ($business.Replace('-','') + '/' + $item.Replace('-','') + '.json')
        $envelope = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        $artifacts += $envelope.Payload | ConvertFrom-Json
    }
    foreach ($field in @('Model','DatasetVersion','Version','ValidationMetrics','TestMetrics','BaselineTestMetrics','QualityAccepted')) {
        if (($artifacts[0].$field | ConvertTo-Json -Depth 10 -Compress) -cne ($artifacts[1].$field | ConvertTo-Json -Depth 10 -Compress)) { throw "Reproducibility mismatch: $field" }
    }
    $summary = @{ VerificationOnly = $true; RealBusinessAccuracy = 'NOT MEASURED'; Reproducible = $true; Model = $artifacts[0].Model.Name; TrainingStart = $artifacts[0].TrainingStart; TrainingEnd = $artifacts[0].TrainingEnd; ValidationMetrics = $artifacts[0].ValidationMetrics; TestMetrics = $artifacts[0].TestMetrics; BaselineTestMetrics = $artifacts[0].BaselineTestMetrics; DatasetVersion = $artifacts[0].DatasetVersion; Version = $artifacts[0].Version }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'verification-summary.json')
    Write-Output "Synthetic CLI reproducibility passed. Real business accuracy is NOT measured. Evidence: $output"
} finally { Pop-Location }
