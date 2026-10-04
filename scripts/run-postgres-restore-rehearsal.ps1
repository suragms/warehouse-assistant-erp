[CmdletBinding()]
param([switch]$KeepCluster)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolNames = @('initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_restore')
$toolsByName = @{}
foreach ($toolName in $toolNames) {
    $tool = Get-Command $toolName -ErrorAction SilentlyContinue
    if (-not $tool) { throw "Required PostgreSQL tool '$toolName' was not found on PATH." }
    $toolsByName[$toolName] = $tool.Source
}

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$runId = [Guid]::NewGuid().ToString('N')
$clusterRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot "wa-phase2-restore-$runId"))
$safePrefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
if (-not $clusterRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    [System.IO.Path]::GetFileName($clusterRoot) -notmatch '^wa-phase2-restore-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $clusterRoot)) {
    throw 'Refusing to use an unexpected PostgreSQL temporary directory.'
}

$dataDirectory = Join-Path $clusterRoot 'data'
$sourceName = "wa_test_source_$runId"
$targetName = "wa_test_restore_$runId"
$adminPassword = [Guid]::NewGuid().ToString('N')
$runnerPassword = [Guid]::NewGuid().ToString('N')
$sourceId = [Guid]::NewGuid().ToString()
$userId = [Guid]::NewGuid().ToString()
$membershipId = [Guid]::NewGuid().ToString()
$categoryId = [Guid]::NewGuid().ToString()
$supplierId = [Guid]::NewGuid().ToString()
$itemId = [Guid]::NewGuid().ToString()
$purchaseId = [Guid]::NewGuid().ToString()
$purchaseItemId = [Guid]::NewGuid().ToString()
$movementId = [Guid]::NewGuid().ToString()
$auditId = [Guid]::NewGuid().ToString()
$adminPwFile = Join-Path $clusterRoot 'initdb-password.txt'
$bootstrapFile = Join-Path $clusterRoot 'bootstrap.sql'
$seedFile = Join-Path $clusterRoot 'seed-rehearsal.sql'
$backupFile = Join-Path $clusterRoot 'wa-rehearsal.dump'
$postgresLog = Join-Path $clusterRoot 'postgres.log'
$applicationOut = Join-Path $clusterRoot 'application.stdout.log'
$applicationErr = Join-Path $clusterRoot 'application.stderr.log'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$envNames = @('PGPASSWORD', 'PURCHASE_ASSISTANT_TEST_DATABASE', 'ConnectionStrings__DefaultConnection', 'ML_DATABASE', 'ML__ArtifactPath', 'Jwt__SecretKey', 'ASPNETCORE_ENVIRONMENT', 'ASPNETCORE_URLS', 'Logging__LogLevel__Default', 'Logging__LogLevel__Microsoft', 'Logging__LogLevel__Microsoft.EntityFrameworkCore')
$oldEnv = @{}
foreach ($name in $envNames) { $oldEnv[$name] = [System.Environment]::GetEnvironmentVariable($name, 'Process') }
$serverStarted = $false
$applicationProcess = $null
$exitCode = 0

function Invoke-CheckedNative([string]$FilePath, [string[]]$Arguments, [string]$Operation) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed with exit code $LASTEXITCODE." }
}

function Set-TestDatabase([string]$DatabaseName, [int]$Port) {
    $connection = "Host=127.0.0.1;Port=$Port;Database=$DatabaseName;Username=wa_test_runner;Password=$runnerPassword;Timeout=10;Command Timeout=120"
    $env:ConnectionStrings__DefaultConnection = $connection
    $env:PURCHASE_ASSISTANT_TEST_DATABASE = $connection
    return $connection
}

function Get-TableCounts([string]$DatabaseName, [int]$Port) {
    $names = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$Port" '--username' 'wa_test_runner' '--dbname' $DatabaseName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '__EFMigrationsHistory' ORDER BY table_name;"
    if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate tables after restore.' }
    $counts = [ordered]@{}
    foreach ($table in $names) {
        $quoted = '"' + ($table -replace '"', '""') + '"'
        $count = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$Port" '--username' 'wa_test_runner' '--dbname' $DatabaseName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' "SELECT COUNT(*) FROM public.$quoted;"
        if ($LASTEXITCODE -ne 0) { throw "Could not count rows in $table." }
        $counts[$table] = [long]$count.Trim()
    }
    return $counts
}

try {
    New-Item -ItemType Directory -Path $clusterRoot | Out-Null
    [System.IO.File]::WriteAllText($adminPwFile, $adminPassword, [System.Text.Encoding]::ASCII)
    Invoke-CheckedNative $toolsByName['initdb'] @('--pgdata', $dataDirectory, '--username', 'postgres', '--encoding', 'UTF8', '--auth-local', 'scram-sha-256', '--auth-host', 'scram-sha-256', '--pwfile', $adminPwFile) 'Private PostgreSQL cluster initialization'
    Remove-Item -LiteralPath $adminPwFile -Force

    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    # Redirect inherited handles to files so the database does not keep a calling pipe open.
    $startupOutput = Join-Path $clusterRoot 'startup.log'
    $startupError = Join-Path $clusterRoot 'startup-error.log'
    $startup = Start-Process -FilePath $toolsByName['pg_ctl'] -ArgumentList @(
        '--pgdata', "`"$dataDirectory`"",
        '--options', "`"-h 127.0.0.1 -p $port -c listen_addresses=127.0.0.1`"",
        '--log', "`"$postgresLog`"", '--wait', 'start'
    ) -WindowStyle Hidden -PassThru -RedirectStandardOutput $startupOutput -RedirectStandardError $startupError
    $startup.WaitForExit()
    if ($startup.ExitCode -ne 0) { throw "PostgreSQL startup failed with exit code $($startup.ExitCode)." }
    Get-Content -LiteralPath $startupOutput
    $serverStarted = $true

    $bootstrapSql = "CREATE ROLE wa_test_runner LOGIN PASSWORD '$runnerPassword';`nCREATE DATABASE $sourceName OWNER wa_test_runner;`nCREATE DATABASE $targetName OWNER wa_test_runner;`n"
    [System.IO.File]::WriteAllText($bootstrapFile, $bootstrapSql, [System.Text.Encoding]::ASCII)
    $env:PGPASSWORD = $adminPassword
    Invoke-CheckedNative $toolsByName['psql'] @('--host', '127.0.0.1', '--port', "$port", '--username', 'postgres', '--dbname', 'postgres', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $bootstrapFile) 'Creation of isolated rehearsal databases'
    Remove-Item -LiteralPath $bootstrapFile -Force
    $env:PGPASSWORD = $runnerPassword
    $env:Logging__LogLevel__Default = 'Warning'
    $env:Logging__LogLevel__Microsoft = 'Warning'
    Set-Item 'Env:Logging__LogLevel__Microsoft.EntityFrameworkCore' 'Warning'
    $env:ASPNETCORE_ENVIRONMENT = 'Testing'
    $env:Jwt__SecretKey = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')

    Push-Location $repositoryRoot
    try {
        Set-TestDatabase $sourceName $port | Out-Null
        Invoke-CheckedNative 'dotnet' @('ef', 'database', 'update', '--project', 'backend/PurchaseAssistant.Infrastructure/PurchaseAssistant.Infrastructure.csproj', '--startup-project', 'backend/PurchaseAssistant.Web/PurchaseAssistant.Web.csproj', '--configuration', 'Release') 'Source schema migration'

        [Reflection.Assembly]::LoadFrom((Join-Path $repositoryRoot 'backend/PurchaseAssistant.Web/bin/Release/net10.0/BCrypt-Net-Next.dll')) | Out-Null
        $rehearsalPassword = 'Rehearsal-' + [Guid]::NewGuid().ToString('N')
        $passwordHash = [BCrypt.Net.BCrypt]::HashPassword($rehearsalPassword)
        $seedSql = @"
INSERT INTO "Businesses" ("Id","Name","Version","IsActive","CreatedAt") VALUES ('$sourceId','ASTRA Restore Rehearsal','$([Guid]::NewGuid().ToString())',true,NOW());
INSERT INTO "Users" ("Id","Name","Email","PasswordHash","Status","CreatedAt") VALUES ('$userId','Rehearsal Owner','restore-$runId@example.invalid','$passwordHash',0,NOW());
INSERT INTO "Memberships" ("Id","BusinessId","UserId","Role","PermissionsJson","CreatedAt") VALUES ('$membershipId','$sourceId','$userId',1,'[]',NOW());
INSERT INTO "Categories" ("Id","BusinessId","Name","CreatedAt") VALUES ('$categoryId','$sourceId','Restore rehearsal category',NOW());
INSERT INTO "Suppliers" ("Id","BusinessId","Name","IsActive","CreatedAt") VALUES ('$supplierId','$sourceId','Restore rehearsal supplier',true,NOW());
INSERT INTO "CatalogItems" ("Id","BusinessId","CategoryId","Name","ItemCode","DefaultUnit","ReorderLevel","CurrentStock","PhysicalStock","ReservedStock","IsActive","RowVersion","CreatedAt") VALUES ('$itemId','$sourceId','$categoryId','Restore rehearsal item','RESTORE-$runId','PCS',2,5,5,0,true,'$([Guid]::NewGuid().ToString())',NOW());
INSERT INTO "Purchases" ("Id","BusinessId","OrderNumber","SupplierId","Status","PaymentState","DeliveryState","Notes","Subtotal","TaxTotal","GrandTotal","CreatedAt","HeaderDiscountPercent","FreightType","FreightAmount","DeliveredCharge","BilltyCharge","CommissionMode","CommissionPercent","CommissionAmount","PaidAmount") VALUES ('$purchaseId','$sourceId','RESTORE-$runId','$supplierId',0,0,0,'Synthetic restore rehearsal',50,0,50,NOW(),0,'separate',0,0,0,'percent',0,0,0);
INSERT INTO "PurchaseItems" ("Id","BusinessId","PurchaseOrderId","CatalogItemId","Unit","FreightType","OrderedQuantity","ReceivedQuantity","UnitPrice","DiscountPercent","TaxPercent","LineTotal","CreatedAt") VALUES ('$purchaseItemId','$sourceId','$purchaseId','$itemId','PCS','separate',5,0,10,0,0,50,NOW());
INSERT INTO "StockMovements" ("Id","BusinessId","CatalogItemId","MovementType","QuantityDelta","QuantityBefore","QuantityAfter","CreatedById","CreatedAt") VALUES ('$movementId','$sourceId','$itemId','RestoreRehearsalSeed',5,0,5,'$userId',NOW());
INSERT INTO "SecurityAuditLogs" ("Id","BusinessId","UserId","EventType","Description","CreatedAt") VALUES ('$auditId','$sourceId','$userId','RestoreRehearsalSeed','Synthetic restore rehearsal row; no real credentials or business data.',NOW());
INSERT INTO "DailyUsageLogs" ("Id","BusinessId","CatalogItemId","Date","OpeningQty","PurchasedQty","UsedQty","ClosingQty","LoggedByUserId","LoggedAt","CreatedAt","IsConfirmed")
SELECT gen_random_uuid(),'$sourceId','$itemId',(NOW() AT TIME ZONE 'UTC')::date + i - 180,100,0,20 + .15*i + 2*EXTRACT(DOW FROM ((NOW() AT TIME ZONE 'UTC')::date + i - 180)),0,'$userId',(((NOW() AT TIME ZONE 'UTC')::date + i - 180) + time '23:00') AT TIME ZONE 'UTC',NOW(),true FROM generate_series(0,179) i;
"@
        [System.IO.File]::WriteAllText($seedFile, $seedSql, [System.Text.Encoding]::UTF8)
        Invoke-CheckedNative $toolsByName['psql'] @('--host', '127.0.0.1', '--port', "$port", '--username', 'wa_test_runner', '--dbname', $sourceName, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $seedFile) 'Synthetic cross-domain rehearsal fixture seed'
        Remove-Item -LiteralPath $seedFile -Force

        $beforeCounts = Get-TableCounts $sourceName $port
        $consistencySql = @"
SELECT CASE WHEN
 (SELECT COUNT(*) FROM "Businesses" WHERE "Id"='$sourceId')=1
 AND (SELECT "CurrentStock" FROM "CatalogItems" WHERE "Id"='$itemId')=5
 AND (SELECT COUNT(*) FROM "StockMovements" WHERE "CatalogItemId"='$itemId' AND "QuantityBefore"+"QuantityDelta"="QuantityAfter")=1
 AND (SELECT COUNT(*) FROM "Purchases" p JOIN "PurchaseItems" i ON i."PurchaseOrderId"=p."Id" WHERE p."Id"='$purchaseId' AND p."BusinessId"=i."BusinessId" AND p."GrandTotal"=i."LineTotal")=1
 AND (SELECT COUNT(*) FROM "SecurityAuditLogs" WHERE "Id"='$auditId' AND "BusinessId"='$sourceId')=1
 THEN 'consistent' ELSE 'inconsistent' END;
"@
        $sourceConsistency = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$port" '--username' 'wa_test_runner' '--dbname' $sourceName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' $consistencySql
        if ($LASTEXITCODE -ne 0 -or $sourceConsistency.Trim() -ne 'consistent') { throw 'Synthetic source backup fixture failed its consistency checks.' }

        Invoke-CheckedNative $toolsByName['pg_dump'] @('--host', '127.0.0.1', '--port', "$port", '--username', 'wa_test_runner', '--dbname', $sourceName, '--no-password', '--format=custom', "--file=$backupFile") 'Custom-format private PostgreSQL backup'
        Invoke-CheckedNative $toolsByName['pg_restore'] @('--host', '127.0.0.1', '--port', "$port", '--username', 'wa_test_runner', '--dbname', $targetName, '--no-password', '--exit-on-error', '--no-owner', '--role=wa_test_runner', $backupFile) 'Restore into the separate clean disposable database'

        Set-TestDatabase $targetName $port | Out-Null
        Invoke-CheckedNative 'dotnet' @('ef', 'database', 'update', '--project', 'backend/PurchaseAssistant.Infrastructure/PurchaseAssistant.Infrastructure.csproj', '--startup-project', 'backend/PurchaseAssistant.Web/PurchaseAssistant.Web.csproj', '--configuration', 'Release') 'Post-restore migration check'
        $afterCounts = Get-TableCounts $targetName $port
        foreach ($table in $beforeCounts.Keys) {
            if (-not $afterCounts.Contains($table) -or $beforeCounts[$table] -ne $afterCounts[$table]) {
                throw "Restored row count mismatch for '$table'."
            }
        }
        if ($afterCounts.Count -ne $beforeCounts.Count) { throw 'Restored table count differs from the source backup.' }
        $targetConsistency = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$port" '--username' 'wa_test_runner' '--dbname' $targetName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' $consistencySql
        if ($LASTEXITCODE -ne 0 -or $targetConsistency.Trim() -ne 'consistent') { throw 'Restored domain fixture failed its consistency checks.' }

        # End-to-end offline pipeline against the restored SYNTHETIC records only.
        $env:ML_DATABASE = $env:ConnectionStrings__DefaultConnection
        $env:ML__ArtifactPath = Join-Path $clusterRoot 'synthetic-models'
        $trainingData = Join-Path $clusterRoot 'synthetic-usage.json'
        Invoke-CheckedNative 'dotnet' @('run','--project','ml/PurchaseAssistant.ML.Tool','--configuration','Release','--','extract',$sourceId,$trainingData) 'Synthetic restored-data extraction'
        Invoke-CheckedNative 'dotnet' @('run','--project','ml/PurchaseAssistant.ML.Tool','--configuration','Release','--','train',$trainingData,$env:ML__ArtifactPath) 'Synthetic restored-data training'

        $env:ASPNETCORE_ENVIRONMENT = 'Testing'
        $env:Jwt__SecretKey = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
        $listener.Start(); $apiPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port; $listener.Stop()
        $baseUrl = "http://127.0.0.1:$apiPort"
        $env:ASPNETCORE_URLS = $baseUrl
        $applicationDll = Join-Path $repositoryRoot 'backend/PurchaseAssistant.Web/bin/Release/net10.0/PurchaseAssistant.Web.dll'
        if (-not (Test-Path -LiteralPath $applicationDll)) { throw 'The Release web application build output is missing.' }
        $applicationProcess = Start-Process -FilePath 'dotnet' -ArgumentList @($applicationDll,'--urls',$baseUrl) -WorkingDirectory (Join-Path $repositoryRoot 'backend/PurchaseAssistant.Web') -PassThru -WindowStyle Hidden -RedirectStandardOutput $applicationOut -RedirectStandardError $applicationErr
        $ready = $false
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            if ($applicationProcess.HasExited) { throw 'Application exited during the restore smoke check.' }
            try {
                $liveResponse = Invoke-WebRequest -Uri "$baseUrl/health/live" -TimeoutSec 3 -SkipHttpErrorCheck
                $response = Invoke-WebRequest -Uri "$baseUrl/health/ready" -TimeoutSec 3 -SkipHttpErrorCheck
                if ($liveResponse.StatusCode -eq 200 -and $response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"ready"') { $ready = $true; break }
            } catch { }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'Application readiness did not succeed against the restored database.' }
        $unauthenticated = Invoke-WebRequest -Uri "$baseUrl/api/v1/users" -TimeoutSec 5 -SkipHttpErrorCheck
        if ($unauthenticated.StatusCode -ne 401) { throw "Unauthenticated user-list request returned $($unauthenticated.StatusCode), expected 401." }

        $login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = "restore-$runId@example.invalid"; password = $rehearsalPassword } | ConvertTo-Json)
        $headers = @{ Authorization = 'Bearer ' + $login.data.accessToken }
        if ($login.data.user.currentBusiness.role -ne 'Owner') { throw 'Restored owner login did not select the expected membership.' }
        $stockBefore = Invoke-RestMethod -Uri "$baseUrl/api/v1/stock/$itemId" -Headers $headers
        if ($stockBefore.systemStock -ne 5) { throw 'Authenticated restored stock read did not match the database.' }
        $stockAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/stock/$itemId/adjust" -Headers $headers -Method Post -ContentType 'application/json' -Body (@{ quantityDelta = 1; reason = 'Synthetic HTTP restore check'; expectedVersion = $stockBefore.rowVersion } | ConvertTo-Json)
        if ($stockAfter.systemStock -ne 6) { throw 'Authenticated stock mutation failed.' }
        $forecast = Invoke-RestMethod -Uri "$baseUrl/api/v1/ml/items/${itemId}?horizon=14" -Headers $headers
        if ($forecast.status -ne 'ready' -or $forecast.forecast.Count -ne 14) { throw 'Restored-data ML HTTP inference failed.' }
        $export = Invoke-WebRequest -Uri "$baseUrl/api/v1/exports/ml/${itemId}.csv?horizon=14" -Headers $headers
        if ($export.StatusCode -ne 200 -or $export.Headers.'Content-Type' -notmatch 'text/csv') { throw 'Authenticated forecast export failed.' }
        $httpSql = @"
SELECT CASE WHEN (SELECT "CurrentStock" FROM "CatalogItems" WHERE "Id"='$itemId')=6
AND EXISTS (SELECT 1 FROM "StockMovements" WHERE "CatalogItemId"='$itemId' AND "QuantityDelta"=1)
AND EXISTS (SELECT 1 FROM "SecurityAuditLogs" WHERE "BusinessId"='$sourceId' AND "EventType"='StockMovementAdded')
AND (SELECT COUNT(*) FROM "MlPredictionLogs" WHERE "CatalogItemId"='$itemId')=1 THEN 'consistent' ELSE 'inconsistent' END;
"@
        $httpConsistency = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$port" '--username' 'wa_test_runner' '--dbname' $targetName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' $httpSql
        if ($LASTEXITCODE -ne 0 -or $httpConsistency.Trim() -ne 'consistent') { throw 'HTTP writes, audit, or prediction deduplication did not persist correctly.' }
        $latencies = @(1..20 | ForEach-Object { $watch = [Diagnostics.Stopwatch]::StartNew(); Invoke-RestMethod -Uri "$baseUrl/api/v1/ml/items/${itemId}?horizon=14" -Headers $headers | Out-Null; $watch.Stop(); $watch.Elapsed.TotalMilliseconds })
        $ordered = $latencies | Sort-Object
        Write-Output ("Synthetic restored-model HTTP inference, 20 sequential warm requests: median {0:F1} ms, p95 {1:F1} ms. This is not representative production load." -f $ordered[9], $ordered[18])

        $env:PGPASSWORD = $runnerPassword
        Invoke-CheckedNative 'dotnet' @('test','backend/PurchaseAssistant.IntegrationTests/PurchaseAssistant.IntegrationTests.csproj','--configuration','Release','--logger','console;verbosity=minimal') 'PostgreSQL regression suite against the restored database'
        Write-Output "Restore rehearsal passed: $($beforeCounts.Count) table row counts matched; migrations and readiness passed; real owner login, stock HTTP mutation, ledger/audit persistence, offline ML extraction/training, HTTP forecast/export and prediction deduplication passed against synthetic restored records; unauthenticated endpoint returned 401. Private test database: $targetName"
    }
    finally { Pop-Location }
}
catch {
    $exitCode = 1
    Write-Error $_
    if (Test-Path -LiteralPath $applicationErr) { Get-Content -Tail 40 -LiteralPath $applicationErr | Write-Output }
    if (Test-Path -LiteralPath $applicationOut) { Get-Content -Tail 40 -LiteralPath $applicationOut | Write-Output }
}
finally {
    if ($applicationProcess -and -not $applicationProcess.HasExited) {
        Stop-Process -Id $applicationProcess.Id -Force -ErrorAction SilentlyContinue
        $applicationProcess.WaitForExit()
    }
    foreach ($name in $envNames) {
        if ($null -eq $oldEnv[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$name" $oldEnv[$name] }
    }
    if ($listener.Server.IsBound) { $listener.Stop() }
    if ($serverStarted) {
        & $toolsByName['pg_ctl'] '--pgdata' $dataDirectory '--wait' '--mode' 'fast' 'stop'
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not stop the private restore rehearsal cluster cleanly.'; $exitCode = 1 }
    }
    if (-not $KeepCluster -and (Test-Path -LiteralPath $clusterRoot)) {
        $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $clusterRoot).Path)
        if ($resolved.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolved) -match '^wa-phase2-restore-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        } else { Write-Warning 'Refusing to remove an unexpected temporary cluster path.'; $exitCode = 1 }
    } elseif ($KeepCluster -and (Test-Path -LiteralPath $clusterRoot)) { Write-Output "Private rehearsal cluster retained at $clusterRoot" }
    $listener.Dispose()
}

exit $exitCode
