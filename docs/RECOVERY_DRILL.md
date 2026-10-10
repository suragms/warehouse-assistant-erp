# Operator recovery drill and controlled cutover

Current implementation: 2026-10-10. [Module design and configuration](BACKUP_RESTORE_DESIGN.md). A verified dump command is not a recovery drill.

## Trusted artifacts and preparation

Use only the UUID `.wab` archive from protected local/secondary recovery storage. HTTP supports selecting stored archives, not arbitrary SQL uploads or paths. Record its UUID, encrypted-file SHA-256, creation time and encryption key ID in the independently protected recovery inventory. If job history is lost, compute the file digest from a trusted secondary copy; the tool still authenticates the envelope with the retained key. Obtain separately protected backup keys, application release, source connection identity, Data Protection key ring/certificate or DPAPI access, business logos (`Images:StoragePath`), qualified ML artifacts (`ML:ArtifactPath`), external credentials and database role/extension/tablespace definitions. These assets are not contained in the native dump.

Use a dedicated recovery working directory under the recovery identity. Copy the selected encrypted archive and its original `.warehouse-backup-storage` dedication marker from trusted storage into that directory, or use the same service identity against its existing dedicated directory. Do not run another identity against the active web service archive directory: directory ACL setup belongs to the executing storage identity. Keep offsite source copies intact and separately protected. Use a recovery host/service identity with filesystem/key access; grant the target database role only the privileges necessary for the required schema/extensions. Preinstall matching extension binaries and provision required role mappings through infrastructure administration. Dump/restore excludes ownership and ACL restoration. `pg_dump` does not back up cluster-wide role/tablespace definitions. Preserve original IDs, records and audit/history rather than recreating missing business facts.

In the web UI, an approved recovery operator selects an archive, runs Verify, waits for success, explicitly confirms recovery preparation within one hour, and pins it. This writes recovery metadata only. The UI does not restore the live database.

## Isolated restore using the production implementation

Build the existing solution in Release. On a private loopback PostgreSQL recovery instance, create a new empty database named `wa_restore_<32 lowercase hexadecimal characters>` with the approved target owner. The test helper uses the equally guarded `wa_test_restore_...` prefix. Never point the tool at an application database. The tool rejects source targets, other names, non-loopback targets and nonempty databases, and uses no `--clean` or `--create` restore flags.

Inject the settings from the module configuration table into this tool's environment from the secret store. It reads environment configuration, not web appsettings. `Backup__RecoveryActorId` must appear in `Backup__RecoveryOperatorUserIds__<n>`. `Backup__RecoveryTargetConnection` holds the target connection; its password must not appear in command arguments. `ConnectionStrings__DefaultConnection` remains the original source identity, even if that source is currently unavailable.

Commands below use only non-secret UUID/digest arguments:

```powershell
dotnet run --project backend/PurchaseAssistant.RecoveryTool --configuration Release --no-build -- inspect <archive-uuid> <sha256>
dotnet run --project backend/PurchaseAssistant.RecoveryTool --configuration Release --no-build -- verify <archive-uuid> <sha256>
dotnet run --project backend/PurchaseAssistant.RecoveryTool --configuration Release --no-build -- restore-isolated <archive-uuid> <sha256> --confirm-isolated
```

Inspect authenticates the package/dump and reports PostgreSQL version, migration IDs, UTC timestamp, table count and compatibility. It never restores. Verification and restore require exact migration-ID compatibility with this tool release; if incompatible, use the backup-era release in isolation first, then rehearse forward migrations with the intended deployment release. Do not bypass compatibility checks to overwrite production.

Restore validates encrypted digest/authentication, manifest/entries/dump digest, PostgreSQL archive readability and compatibility before executing `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`. It then compares every recorded public table count, migration history and validated constraints. If restore fails, preserve diagnostics/audit and the isolated target for investigation; create another empty target for a retry. Never add destructive cleanup flags to make a retry work.

The tool records encrypted `.wabevent` files in protected recovery storage before and after its operation, plus `DatabaseBackupEvents` when the source database is available. A lost source/job table does not block offline recovery. CLI authority is the OS/secret-store recovery boundary, distinct from browser authentication; the actor ID labels the explicitly configured operator. Protect the recovery environment and audit files accordingly. A requested event without a success event requires investigation.

## Application and domain qualification

Before cutover, run the matching application against the isolated copy in a private environment with background jobs, outgoing integrations and public traffic disabled. Verify authentication/tenant membership, catalog identity/barcodes, current and reserved/physical stock, immutable stock ledger and transaction history, supplier relationships, financial reports and audit history. Check both permitted and denied cross-tenant access. Validate Data Protection encrypted credentials with the recovered key ring, protected logos and qualified ML artifacts. Compare documented critical-record digests/counts to the recovery manifest and source recovery inventory. Rehearse any forward migrations only here.

The automated test proves native schema/count/migration/constraint recovery and exact stock/catalog values for synthetic two-tenant records. It does not prove external credential decryption, real-user login, outgoing integrations or business-sized application recovery. Record actual backup age, restore/validation duration, dataset size, key and media availability, operator sign-off and accepted RPO/RTO from a representative drill.

## Controlled deployment cutover and rollback

No hosting-specific live switch was executed or automated: production topology and recovery authority were not supplied. Use the deployment's existing maintenance and configuration procedures.

1. Establish a maintenance window, suspend writes/jobs/integrations and preserve a fresh infrastructure/native pre-cutover recovery point plus original database and external assets. Pin the chosen recovery archive; do not delete the original database.
2. Complete isolated database and application qualification, required migrations and key/asset recovery. Review the restored account/session state; revoke restored session/token families and reconcile security/credential changes made after backup through approved administration before exposing the restored application.
3. Have the deployment administrator switch the application connection/secret reference to the validated recovery database, restart the matching release, then run read-only smoke checks. Record the connection change, operator, recovery point and maintenance evidence without logging secrets.
4. Resume writes and outgoing jobs only after qualification and authorization. Reconcile backup jobs captured as running in the dump, their leases and actual file availability; keep schedules disabled until this is complete. Ensure schedules/operator policies/private storage still point to the intended environment. Never run the old and restored writers against divergent databases unintentionally.
5. If qualification fails before writes resume, stop the restored application, return the connection reference and release to the preserved original environment, and revalidate. After writes resume, do not blindly roll back to the stale original database; reconcile intervening writes or use the approved recovery process. Keep both environments until retention/recovery authority approves disposal.

## Repeatable disposable drill and actual evidence

```powershell
./scripts/run-postgres-integration-tests.ps1
```

The helper creates a random private PostgreSQL 17 cluster bound to loopback, a nonsuperuser test role, `wa_test_<uuid>` source and empty `wa_test_restore_<uuid>` target, applies migrations only there, builds the recovery tool and runs the integration suite. It restores prior process environment, stops the known cluster and deletes only the validated generated temporary root after successful shutdown.

`backend/PurchaseAssistant.IntegrationTests/DatabaseBackupIntegrationTests.cs` creates synthetic records for two tenants, captures actual encrypted native output and a checked secondary copy, exercises CLI inspect/verify, restores while its source connection is configured unavailable, verifies table/migration/constraint counts and exact catalog/stock values, authenticates offline audit events, checks the original values are unchanged, and rejects source/nonempty targets and altered ciphertext. The broader PostgreSQL suite also exercises barcode isolation, history/inventory invariants and the model/migration match.

Final counts and build results are recorded in [IMPLEMENTATION_AND_TEST_PLAN.md](IMPLEMENTATION_AND_TEST_PLAN.md). The secondary copy in this test is another local protected directory, not tested offsite media. No production database or physical backup media was used.
