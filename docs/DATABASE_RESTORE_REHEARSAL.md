> Historical checkpoint. Phase 3 supersedes current implementation/status claims here; see [final readiness](FINAL_PRODUCTION_READINESS_2026-10-03.md) and [final matrix](FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md). The old invoice/WhatsApp-removal finding is corrected in the current AI parity report.

# Database Backup and Restore Rehearsal

Date: 2026-10-03  
Status: **isolated synthetic restore rehearsal implemented; production-copy recovery remains unqualified**

## Safety boundary

The repeatable local rehearsal is `scripts/run-postgres-restore-rehearsal.ps1`. It creates a randomly named, loopback-only PostgreSQL cluster under the operating system temporary directory, creates separate randomly named `wa_test_*` source and restore databases, uses a dedicated test role, and removes the private cluster after completion. It does not read or use application User Secrets, the installed local PostgreSQL service, a deployment connection string, or a production backup.

The rehearsal seeds synthetic-only rows for a Business, owner membership, category, supplier, catalog item, stock movement, purchase/line total and audit event. It uses a deliberately unusable password hash and `.invalid` email. The script verifies source and restored stock arithmetic, purchase/line financial totals, tenant equality, audit ownership, and row counts for all application tables. It then runs EF migrations on the restored database, starts the app against that database, checks `/health/live`, `/health/ready`, and expects an unauthenticated `/api/v1/users` request to return 401. Finally, it runs the PostgreSQL integration suite against the restored database.

Run from the repository root in PowerShell:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-postgres-restore-rehearsal.ps1
```

The script fails closed if PostgreSQL tools are missing, migrations/restore/consistency checks fail, app readiness fails, the protected route is not 401, or integration tests fail. The temporary cluster is removed in `finally`, including on an error path. Do not add a production connection string to this script.

## Non-production backup/restore procedure

This procedure is for an operator-approved, isolated staging copy only. First verify the target host, database name, environment and backup provenance with a second operator. Do not run `dropdb`, `DROP DATABASE`, `pg_restore --clean`, or destructive migration commands against a production connection.

1. Freeze writes to the **staging source copy** or take a database-consistent snapshot and record the app version, PostgreSQL major version, latest migration, tenant count and backup timestamp.
2. Use the deployment’s secret manager or a protected `PGPASSFILE`; avoid putting passwords in command history, process arguments, logs or this document.
3. Take an encrypted custom-format backup and record its checksum:

   ```powershell
   pg_dump --format=custom --no-owner --file $BackupFile $StagingSourceConnection
   Get-FileHash -Algorithm SHA256 $BackupFile
   ```

4. Create a **new, empty, separately named** staging restore database owned by a least-privilege restore/application role. Verify that it is not the source and not production.
5. Restore into that clean target, preserving the source backup file:

   ```powershell
   pg_restore --exit-on-error --no-owner --role=$RestoreRole --dbname=$CleanTargetConnection $BackupFile
   ```

6. Record source/target row counts for each tenant-owned table. Reconcile business, user/membership, catalog, suppliers, purchases/lines, financial totals, stock, movement ledger, damage, reports’ source rows, and security-audit records. Check foreign keys, duplicate keys, tenant composite relationships, and `Purchase GrandTotal`/line totals according to the app’s calculation contract.
7. Run `dotnet ef database update` against the restored **staging target only** using the matching release and verify no unexpected pending migration/model changes.
8. Start the matching application against the target. Verify live/ready health, a valid staged owner login, a staged staff login, selected-business scope, and the owner/staff/API checks in the production-readiness runbook. Verify that a deliberately wrong-tenant ID is denied. Compare inventory, purchase, supplier, financial, report and audit reads to the restored source snapshot.
9. If validation fails, stop the app, retain the immutable source backup and failed target for investigation under the approved retention policy, and discard/recreate only the disposable target. Do not write back into the source. If a promotion has already occurred, use the release rollback owner and deployment rollback plan; restoring database state is a separate, approved operation.
10. Record operator, timestamp, source/target identifiers (redacted as needed), backup checksum, release/migration, row-count comparison, smoke results, rollback decision and any exceptions. Securely delete the rehearsal copy and backup under the staging-data retention policy.

## Validation checklist

- [x] Private backup artifact created and restored to a clean private database by the local rehearsal script.
- [x] Synthetic business, membership, catalog, supplier, stock movement, purchase/line totals and audit rows checked after restore.
- [x] All application-table row counts compared between the isolated source backup and restored target.
- [x] Migrations applied/checked on the restored target.
- [x] App liveness/readiness and unauthenticated authorization boundary checked against restored schema/data.
- [x] PostgreSQL integration suite run against the restored target (exact latest result goes in `CURRENT_FEATURE_AUDIT_2026-10-03.md`).
- [ ] Successful staged owner login using a real staged account. The local synthetic password is intentionally non-authenticatable.
- [ ] Successful staged staff login and authorized/denied operation matrix.
- [ ] Restore of an approved, representative staging snapshot with realistic domain relationships and encrypted provider credentials.
- [ ] Production backup retention, encryption, off-site copy, restore-time objective, recovery-point objective and promotion/rollback ownership.

## Known limitations

No staging or production copy, operator account, credentials, external key ring, or approved recovery window was provided. The local script proves a repeatable PostgreSQL custom-format dump/restore and target startup against a synthetic fixture; it does not prove production backup freshness, permissions, encryption-at-rest, external object-store backup, recovery timing, real login, data volume or a valid production migration/rollback. The application’s user-facing archive/restore endpoint remains disabled (restore returns 501) until the product defines a safe restore contract.
