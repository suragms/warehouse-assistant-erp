# Phase 4 production hardening plan

Reviewed the Phase 3 matrix, architecture, model card and readiness report against the ML tool, serving service, provider routes, authorization and private PostgreSQL harness. Preserve completed workflows and the existing mobile layout.

| Remaining area | Initial classification | Work / evidence required |
|---|---|---|
| Real ML evaluation | REQUIRES USER DATA | No eligible historical consumption file or authorized operational ML connection is available. Contact CSVs are not demand. Add reproducible extraction, evaluation cohorts and guarded promotion; never claim synthetic scores as business accuracy. |
| Live AI | REQUIRES EXTERNAL CREDENTIALS | Retain encrypted settings, bounded transport, retry/circuit tests. Requires an authorized account/key/model and a successful real request. |
| Live WhatsApp | REQUIRES EXTERNAL CREDENTIALS | Retain confirmed recipient, quantity PDF, durable attempts and manual uncertainty resolution. Requires an approved live account and recipient. |
| Recovery / image OCR / voice | REQUIRES EXTERNAL CREDENTIALS | No approved delivery/image/speech adapter contract exists. Document contracts and explicit unavailable behavior; optional services cannot block core operations. |
| Trusted historical import | IMPLEMENTABLE NOW | Owner-only CSV preview and all-or-none commit for attested daily consumption. Validate tenant/warehouse/item/unit/date/source timestamp/type, duplicates and bounds. Preserve import provenance separately from current stock and original observation time. Real import input still requires user data. |
| Recovery qualification | IMPLEMENTABLE NOW | Extend private nonproduction dump/restore rehearsal with measured backup, restore, integrity and application recovery plus real HTTP workflows. Production topology, retention and RTO/RPO qualification requires production infrastructure. |
| Load / database performance | IMPLEMENTABLE NOW | Run bounded concurrent workloads in the private database, collect latency/throughput/errors/CPU/memory/database statistics and actual query plans. Fix only observed problems. Production capacity qualification requires production infrastructure. |
| Physical devices | REQUIRES PHYSICAL DEVICE | Repeat supported browser/PWA/keyboard/camera fallback regression; physical Android/iOS/scanner qualification remains pending without hardware. |

Completion evidence and final classifications are recorded in `FINAL_PRODUCTION_VERIFICATION_2026-10-04.md`. Business is the application's single logical warehouse boundary. Historical purchases, snapshots and stock corrections cannot be relabelled as consumption. No synthetic model is installed in production and no live database is used for destructive tests.
