# Production recovery rehearsal — nonproduction evidence

**Local rehearsal passed. Production-environment qualification remains YELLOW.** No live/developer database was restored, modified or stopped. The existing unrelated PostgreSQL service was left alone.

Command: `pwsh -NoProfile -File scripts/run-postgres-restore-rehearsal.ps1 -RunLoad`. The harness provisions a new loopback-only temporary PostgreSQL cluster, random `wa_test_source_*` / `wa_test_restore_*` databases and a dedicated role. It validates temporary paths before cleanup, restores prior environment values and removes the private cluster. Credentials are ephemeral, never printed or committed. No externally supplied database is accepted for destructive testing.

Latest complete evidence: `TestResults/phase4-restore-load.log` and JSON reports with run ID `d95d78d9d06f4ca1b92e937b32b810f6`. Earlier failed harness attempts are diagnostic evidence, not successful rehearsals.

| Stage | Measured result |
|---|---|
| PostgreSQL custom-format backup | 0.346 s |
| Restore into separate empty database | 0.840 s |
| Integrity validation after migrations | 3.063 s |
| Application startup through authenticated workflow verification | 5.330 s |
| Restore start through verified application | 18.083 s, including migration check, integrity checks and restored dataset extraction |
| Database integrity | All 32 table row counts match; scoped stock/ledger/purchase-line/audit invariants pass |
| Model assets | Separate private model-file backup/restore; original and restored SHA-256 match byte-for-byte |
| Restored PostgreSQL regression | 66 passed, zero failed/skipped |

Fixture: one synthetic Business/Owner/category/supplier, 2,005 active items, 3,001 purchase headers with corresponding lines, 10,001 movements, 180 generated confirmed usage days and historical-import provenance. The source model was trained before backup and its files copied separately. After restoring the database and files, inference uses the restored artifact; recovery does not silently train a replacement serving model.

Verified sequence: backup → restore → latest migrations/readiness → real owner login → inventory read and versioned stock adjustment → purchase/line read → reports → explicit unconfigured-AI error → restored ML inference/CSV → persisted audit/ledger/prediction deduplication. The real historical API also previews, commits and rejects a repeated synthetic import in PostgreSQL, while stock remains unchanged. The authenticated audit endpoint is readable and unauthenticated user access returns 401. Generated test data is explicitly synthetic; no business accuracy or live AI success is inferred.

PostgreSQL and model files are separate recovery assets. The rehearsal does **not** certify backup of a production key ring, production encryption/retention, TLS/proxy/cookies, replication, geographic failure or external-provider accounts. Database counters/asset checks and the 66 restored tests verify this disposable instance only. The local 18.083-second measured recovery interval is not an agreed production RTO or RPO.

Before production qualification: use an approved representative staging copy and deployment topology, independently protected database/model/key-ring backups, tested restore permissions, current migration release, defined RPO/RTO and retention, and an approved rollout/rollback window. Recheck live credentials after restoring the shared key ring. The user-facing restore-commit endpoint remains deliberately disabled; operators use the guarded recovery procedure.
