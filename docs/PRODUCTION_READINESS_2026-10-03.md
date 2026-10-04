> Historical checkpoint. Phase 3 supersedes current implementation/status claims here; see [final readiness](FINAL_PRODUCTION_READINESS_2026-10-03.md) and [final matrix](FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md). The old invoice/WhatsApp-removal finding is corrected in the current AI parity report.

# Production Readiness — 2026-10-03

**RED — Not Production Ready**

This status follows the acceptance rule in the Phase 2 request. Local code and test improvements are not equivalent to staging or production qualification. The final local validation completed on 2026-10-03; results are recorded below.

## Architecture

- Backend: ASP.NET Core .NET 10, EF Core, PostgreSQL; API and domain logic are tenant-scoped by `BusinessId`.
- Frontend: React 19, TypeScript 6, Vite; responsive desktop/mobile web and PWA shell.
- Current warehouse contract: one logical stock pool per Business; see `WAREHOUSE_MODEL_DECISION.md`.
- AI: optional purchase-intent candidate parser with multiple HTTP providers and human review. No AI writes purchases or inventory.
- ML: no training pipeline, inference endpoint or model artifact. No predicted values are displayed.

## Readiness evidence

| Area | Status | Evidence / remaining requirement |
|---|---|---|
| Database schema | Candidate for staging | EF migrations run successfully on private empty PostgreSQL. Latest local restore rehearsal verifies synthetic fixture backup/restore, row-count equality, migrations and app readiness. Production snapshot and migration rollback are not available. |
| Database backup/recovery | RED | `DATABASE_RESTORE_REHEARSAL.md` provides the runbook. No approved staging/production backup, successful real-account restore or measured RTO/RPO. App restore endpoint remains disabled. |
| Security and tenant isolation | Partial | Server authorization, membership permission refresh, tenant query filters/composite constraints and regression tests exist. Whole-route direct-API IDOR and field-redaction matrix is not complete; production data/security review is unavailable. |
| Authentication | Partial | Login/refresh/logout and selected-business token behavior have automated coverage. Successful staged owner/staff login, production cookie/HTTPS, persistent Data Protection keys, revocation and password-recovery delivery remain unverified. |
| Owner workflow | Partial | Main routes and server services exist; finance response scoping was fixed and tested. Full end-to-end create/edit/activate staff, role/permission assignment, exports, report totals and audit verification in a live staged database remain. |
| Staff workflow | Partial | Permission-based route and API services exist. A complete positive and negative direct-API matrix for every staff permission and tenant-scoped object is outstanding. |
| Inventory | Partial | System and physical balances, movement ledger, purchase receive, damage transaction/concurrency and low-stock APIs/UI are present. Full workflow reconciliation, all history writers, thresholds and production-scale operations are not qualified. |
| AI | Partial | Automated handler/fake tests cover code paths; missing-key providers are skipped and secrets are not returned/logged. Credentialed staging provider delivery, quota, model availability, key rotation/key ring and quality are unverified. |
| OCR / WhatsApp | Not implemented | Current reference removes scan and WhatsApp source/schema; target delivery contracts are absent. Do not claim OCR, photo recognition, voice or WhatsApp parity. |
| ML | RED / blocked | No model, training/inference implementation or artifact found. Forecasting needs a business-approved dataset, validation target, evaluation criteria and artifact lifecycle. |
| Testing | PASS locally; staging partial | Backend Release unit/endpoint: 390 passed, 0 skipped, 0 failed. Frontend: 106 passed across 12 files. PostgreSQL: 57 passed/0 skipped/0 failed on a clean private DB and 57 passed/0 skipped/0 failed after synthetic restore. Playwright desktop/mobile browser suite: 200 passed. Browser API fixtures do not prove staged persistence or live authorization. |
| Build/lint | PASS locally | Frontend TypeScript/Vite production build passed (2,108 modules; main JS 459.67 KB raw / 135.69 KB gzip). Backend Release build passed with 0 warnings/errors. Oxlint: exit 0, 0 warnings (prior baseline 20). |
| Dependency security | PARTIAL | `npm audit --omit=dev`: 0 vulnerabilities. Full frontend audit reports 5 high advisories in Tailwind 3's dev-only dependency chain. Current `braces` advisory has no patched release; npm proposes a breaking Tailwind 4 migration. No force upgrade was applied; assess Tailwind migration when the patched release/toolchain is available. |
| Deployment | RED | No staging host, production settings, secret/key-ring store, deployment pipeline, monitoring/alerting, migration window, data-retention review or rollback owner supplied. |
| Physical devices / installed PWA | Unverified | Responsive desktop and mobile browser tests can be run. No physical Android/iOS device is available; installed-PWA, camera, actual mobile keyboard/insets and offline recovery cannot be certified. |
| Performance / scale | Unverified | Browser and build checks passed, but no representative tenant data, query plans, load test, multi-instance SignalR or production telemetry was available. Main JS is 459.67 KB raw / 135.69 KB gzip. No stock caching was added. |

## Final local verification

The isolated restore rehearsal seeded synthetic-only data, compared counts for 28 application tables and checked stock, purchase, audit and tenant invariants. The restored database accepted a no-op migration check; app liveness/readiness passed; an unauthenticated protected request returned 401; then all 57 PostgreSQL integration tests passed with no skips. This rehearsal does not use a production backup or validate a real user password. See `DATABASE_RESTORE_REHEARSAL.md`.

The full dependency audit remains a development-tool risk; `braces@3.0.3` is within the advisory's affected range, and no patched registry version was available. An attempted patch-level package override failed because `braces@3.0.4` is not published, so the override was removed. No Tailwind major migration or dependency-lock change was retained.

## Release gate

Do not release as production-ready until the production owner supplies a staging copy/environment and approves a credentialed, representative recovery and workflow pass; the route-by-route authorization and financial-field matrix is complete; all required PostgreSQL tests pass with no unexplained skips; owner and staff workflows pass through actual persistence; provider/key-ring setup is verified or AI remains explicitly disabled; monitoring, backup retention, RTO/RPO and rollback ownership are signed off; and the physical-device/PWA requirements are either verified or formally accepted as a non-critical limitation.

Use the exact status **RED — Not Production Ready** while any critical verification remains blocked.
