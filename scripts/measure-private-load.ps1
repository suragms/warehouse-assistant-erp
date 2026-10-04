# Dot-sourced ONLY inside the guarded disposable restore harness. No supplied database or URL is accepted.
if (-not $RunLoad -or $targetName -notmatch '^wa_test_restore_[a-f0-9]{32}$' -or $baseUrl -notmatch '^http://127\.0\.0\.1:\d+$') { throw 'Refusing load outside the disposable rehearsal.' }
$env:WA_LOAD_URL = $baseUrl
$env:WA_LOAD_DATABASE = $targetName
$env:WA_LOAD_ITEMS = $loadItems -join ','
$env:WA_LOAD_TOKEN = $login.data.accessToken
$env:WA_LOAD_PID = "$($applicationProcess.Id)"
$env:WA_LOAD_EMAIL = "restore-$runId@example.invalid"
$env:WA_LOAD_PASSWORD = $rehearsalPassword
$env:WA_LOAD_SUPPLIER = $supplierId
$env:WA_LOAD_ML_ITEM = $itemId

function Read-PrivateDatabaseJson([string]$Sql) {
    $raw = & $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$port" '--username' 'wa_test_runner' '--dbname' $targetName '--no-psqlrc' '--no-password' '--tuples-only' '--no-align' '--command' $Sql
    if ($LASTEXITCODE -ne 0) { throw 'Private database measurement failed.' }
    return ($raw -join "`n") | ConvertFrom-Json
}
$statsSql = "SELECT row_to_json(s) FROM (SELECT xact_commit,xact_rollback,blks_read,blks_hit,tup_returned,tup_fetched,tup_inserted,tup_updated,temp_files,temp_bytes,deadlocks,numbackends FROM pg_stat_database WHERE datname=current_database()) s;"
$statisticsBefore = Read-PrivateDatabaseJson $statsSql
# Whole-machine Postgres CPU cannot be attributed because unrelated developer clusters may be active. Use this database's counters.
$loadReportPath = Join-Path $repositoryRoot "TestResults/phase4-load-$runId.json"
& dotnet run --project tools/PurchaseAssistant.LoadTest --configuration Release -- --nonproduction $loadReportPath
$loadExitCode = $LASTEXITCODE
$statisticsAfter = Read-PrivateDatabaseJson $statsSql
$deltas = [ordered]@{}
foreach ($field in @('xact_commit','xact_rollback','blks_read','blks_hit','tup_returned','tup_fetched','tup_inserted','tup_updated','temp_files','temp_bytes','deadlocks')) { $deltas[$field] = $statisticsAfter.$field - $statisticsBefore.$field }

& $toolsByName['psql'] '--host' '127.0.0.1' '--port' "$port" '--username' 'wa_test_runner' '--dbname' $targetName '--no-psqlrc' '--no-password' '--command' 'ANALYZE "CatalogItems"; ANALYZE "Purchases"; ANALYZE "StockMovements"; ANALYZE "DailyUsageLogs";' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Private measurement analyze failed.' }
$queries = [ordered]@{
    inventory = "SELECT `"Id`",`"Name`",`"CurrentStock`" FROM `"CatalogItems`" WHERE `"BusinessId`"='$sourceId' AND `"IsActive`" ORDER BY `"Name`",`"Id`" LIMIT 50;"
    dashboard = "SELECT `"Status`",COUNT(*),SUM(`"GrandTotal`") FROM `"Purchases`" WHERE `"BusinessId`"='$sourceId' GROUP BY `"Status`";"
    report = "SELECT `"SupplierId`",COUNT(*),SUM(`"GrandTotal`") FROM `"Purchases`" WHERE `"BusinessId`"='$sourceId' AND `"Status`" NOT IN (0,6) AND `"CreatedAt`">NOW()-interval '30 days' GROUP BY `"SupplierId`";"
    movements = "SELECT `"Id`",`"CreatedAt`",`"QuantityDelta`" FROM `"StockMovements`" WHERE `"BusinessId`"='$sourceId' AND `"CatalogItemId`"='$itemId' AND `"CreatedAt`">NOW()-interval '180 days' ORDER BY `"CreatedAt`" DESC LIMIT 2000;"
    ml_extraction = "SELECT `"CatalogItemId`",`"Date`",`"UsedQty`" FROM `"DailyUsageLogs`" WHERE `"BusinessId`"='$sourceId' AND `"CatalogItemId`"='$itemId' AND `"Date`">=(NOW() AT TIME ZONE 'UTC')::date-730 ORDER BY `"CatalogItemId`",`"Date`" LIMIT 150001;"
}
$plans = [ordered]@{}
foreach ($entry in $queries.GetEnumerator()) {
    $query = $entry.Value
    $plans[$entry.Key] = Read-PrivateDatabaseJson ("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + $query)
}
$databaseReportPath = Join-Path $repositoryRoot "TestResults/phase4-database-load-$runId.json"
@{ NonproductionSynthetic = $true; StatisticsBefore = $statisticsBefore; StatisticsAfter = $statisticsAfter; Deltas = $deltas; Plans = $plans;
    Limits = 'Database counters cover this private database. Cache misses are block reads, not measured disk latency. No aggregate CPU of unrelated PostgreSQL clusters is attributed. Plans use populated synthetic tables and warm local storage.' } | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $databaseReportPath
Write-Output 'Private database counters and measured query plans saved. No production database was accessed.'

if ($loadExitCode -ne 0) { throw 'Controlled private load recorded unexpected failures; inspect its report.' }
