[CmdletBinding()]
param(
    [switch]$KeepCluster
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$postgresTools = @('initdb', 'pg_ctl', 'psql')
$resolvedTools = @{}
foreach ($toolName in $postgresTools) {
    $tool = Get-Command $toolName -ErrorAction SilentlyContinue
    if (-not $tool) {
        throw "Required PostgreSQL tool '$toolName' was not found on PATH. Install PostgreSQL client/server tools and retry."
    }
    $resolvedTools[$toolName] = $tool.Source
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$runId = [Guid]::NewGuid().ToString('N')
$clusterRoot = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot "wa-phase2-pg-$runId"))
$safePrefix = $temporaryRoot + [System.IO.Path]::DirectorySeparatorChar
if (-not $clusterRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    [System.IO.Path]::GetFileName($clusterRoot) -notmatch '^wa-phase2-pg-[a-f0-9]{32}$') {
    throw 'Refusing to use an unexpected PostgreSQL temporary directory.'
}
if (Test-Path -LiteralPath $clusterRoot) {
    throw 'The generated PostgreSQL temporary directory already exists.'
}

$dataDirectory = Join-Path $clusterRoot 'data'
$bootstrapPasswordFile = Join-Path $clusterRoot 'initdb-password.txt'
$bootstrapSqlFile = Join-Path $clusterRoot 'create-test-role.sql'
$serverLog = Join-Path $clusterRoot 'postgres.log'
$adminPassword = [Guid]::NewGuid().ToString('N')
$runnerPassword = [Guid]::NewGuid().ToString('N')
$databaseName = "wa_test_$runId"
$restoreDatabaseName = "wa_test_restore_$runId"
$portListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$environmentNames = @(
    'PGPASSWORD',
    'PURCHASE_ASSISTANT_TEST_DATABASE',
    'PURCHASE_ASSISTANT_RESTORE_TEST_DATABASE',
    'ConnectionStrings__DefaultConnection',
    'Jwt__SecretKey',
    'ASPNETCORE_ENVIRONMENT',
    'Logging__LogLevel__Default',
    'Logging__LogLevel__Microsoft',
    'Logging__LogLevel__Microsoft.EntityFrameworkCore'
)
$priorEnvironment = @{}
foreach ($name in $environmentNames) {
    $priorEnvironment[$name] = [System.Environment]::GetEnvironmentVariable($name, 'Process')
}
$serverStarted = $false
$clusterStopped = $true
$exitCode = 0

function Invoke-CheckedNative([string]$FilePath, [string[]]$Arguments, [string]$Operation) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

try {
    New-Item -ItemType Directory -Path $clusterRoot | Out-Null
    [System.IO.File]::WriteAllText($bootstrapPasswordFile, $adminPassword, [System.Text.Encoding]::ASCII)
    Invoke-CheckedNative $resolvedTools['initdb'] @(
        '--pgdata', $dataDirectory,
        '--username', 'postgres',
        '--encoding', 'UTF8',
        '--auth-local', 'scram-sha-256',
        '--auth-host', 'scram-sha-256',
        '--pwfile', $bootstrapPasswordFile
    ) 'PostgreSQL cluster initialization'
    Remove-Item -LiteralPath $bootstrapPasswordFile -Force

    $portListener.Start()
    $port = ([System.Net.IPEndPoint]$portListener.LocalEndpoint).Port
    $portListener.Stop()
    # PostgreSQL outlives pg_ctl. Explicit file handles avoid an inherited output
    # pipe keeping PowerShell redirection open until the server shuts down.
    $startupOutput = Join-Path $clusterRoot 'startup.log'
    $startupError = Join-Path $clusterRoot 'startup-error.log'
    # A launch can succeed even if process-exit inspection fails. Always attempt shutdown before cleanup.
    $serverStarted = $true
    $clusterStopped = $false
    $startup = Start-Process -FilePath $resolvedTools['pg_ctl'] -ArgumentList @(
        '--pgdata', "`"$dataDirectory`"",
        '--options', "`"-h 127.0.0.1 -p $port -c listen_addresses=127.0.0.1`"",
        '--log', "`"$serverLog`"", '--wait', 'start'
    ) -WindowStyle Hidden -PassThru -RedirectStandardOutput $startupOutput -RedirectStandardError $startupError
    # Cache the handle before waiting: Windows PowerShell 5 can otherwise return a null ExitCode.
    [void]$startup.Handle
    $startup.WaitForExit()
    if ($startup.ExitCode -ne 0) { throw "PostgreSQL startup failed with exit code $($startup.ExitCode)." }
    Get-Content -LiteralPath $startupOutput
    $serverStarted = $true

    $sql = "CREATE ROLE wa_test_runner LOGIN PASSWORD '$runnerPassword';" + [System.Environment]::NewLine +
        "CREATE DATABASE $databaseName OWNER wa_test_runner;" + [System.Environment]::NewLine +
        "CREATE DATABASE $restoreDatabaseName OWNER wa_test_runner;" + [System.Environment]::NewLine
    [System.IO.File]::WriteAllText($bootstrapSqlFile, $sql, [System.Text.Encoding]::ASCII)
    $env:PGPASSWORD = $adminPassword
    Invoke-CheckedNative $resolvedTools['psql'] @(
        '--host', '127.0.0.1', '--port', "$port", '--username', 'postgres', '--dbname', 'postgres',
        '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', $bootstrapSqlFile
    ) 'Dedicated test role/database creation'
    Remove-Item -LiteralPath $bootstrapSqlFile -Force
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    $connection = "Host=127.0.0.1;Port=$port;Database=$databaseName;Username=wa_test_runner;Password=$runnerPassword;Timeout=10;Command Timeout=120"
    $env:ASPNETCORE_ENVIRONMENT = 'Testing'
    $env:Jwt__SecretKey = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $env:ConnectionStrings__DefaultConnection = $connection
    $env:PURCHASE_ASSISTANT_TEST_DATABASE = $connection
    $env:PURCHASE_ASSISTANT_RESTORE_TEST_DATABASE = "Host=127.0.0.1;Port=$port;Database=$restoreDatabaseName;Username=wa_test_runner;Password=$runnerPassword;Timeout=10;Command Timeout=120"
    $env:Logging__LogLevel__Default = 'Warning'
    $env:Logging__LogLevel__Microsoft = 'Warning'
    Set-Item 'Env:Logging__LogLevel__Microsoft.EntityFrameworkCore' 'Warning'

    Push-Location $repositoryRoot
    try {
        Invoke-CheckedNative 'dotnet' @(
            'ef', 'database', 'update',
            '--project', 'backend/PurchaseAssistant.Infrastructure/PurchaseAssistant.Infrastructure.csproj',
            '--startup-project', 'backend/PurchaseAssistant.Web/PurchaseAssistant.Web.csproj',
            '--configuration', 'Release'
        ) 'Target schema migration on the disposable test database'
        Invoke-CheckedNative 'dotnet' @('build', 'backend/PurchaseAssistant.RecoveryTool/PurchaseAssistant.RecoveryTool.csproj', '--configuration', 'Release') 'Recovery tool build'
        Invoke-CheckedNative 'dotnet' @(
            'test', 'backend/PurchaseAssistant.IntegrationTests/PurchaseAssistant.IntegrationTests.csproj',
            '--configuration', 'Release',
            '--logger', 'console;verbosity=minimal'
        ) 'PostgreSQL integration test suite'
    }
    finally {
        Pop-Location
    }
}
catch {
    $exitCode = 1
    Write-Error $_
}
finally {
    foreach ($name in $environmentNames) {
        if ($null -eq $priorEnvironment[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$name" $priorEnvironment[$name] }
    }
    if ($portListener.Server.IsBound) { $portListener.Stop() }

    if ($serverStarted) {
        & $resolvedTools['pg_ctl'] '--pgdata' $dataDirectory '--wait' '--mode' 'fast' 'stop'
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'Could not stop the disposable PostgreSQL cluster cleanly; preserving its files.'
            $exitCode = 1
        }
        else { $clusterStopped = $true }
    }

    if (-not $KeepCluster -and $clusterStopped -and (Test-Path -LiteralPath $clusterRoot)) {
        $resolvedClusterRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $clusterRoot).Path)
        if ($resolvedClusterRoot.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
            [System.IO.Path]::GetFileName($resolvedClusterRoot) -match '^wa-phase2-pg-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $resolvedClusterRoot -Recurse -Force
        }
        else {
            Write-Warning 'Refusing to remove an unexpected PostgreSQL temporary directory.'
            $exitCode = 1
        }
    }
    elseif ((Test-Path -LiteralPath $clusterRoot)) {
        Write-Output "Disposable PostgreSQL cluster retained at $clusterRoot"
    }
    $portListener.Stop()
}

exit $exitCode
