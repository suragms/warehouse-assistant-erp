# Current feature audit — Phase 3

Updated 2026-10-04. This is the current implementation summary; earlier Phase 2 reports are historical checkpoints. See the [final feature matrix](FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md), [production readiness](FINAL_PRODUCTION_READINESS_2026-10-03.md), [AI parity](AI_FEATURE_PARITY_2026-10-03.md) and [ML model card](ML_MODEL_CARD_2026-10-03.md) for evidence and exact limitations.

**Status: YELLOW — Production Candidate.** Supported local workflows and the ML pipeline are implemented and tested. No production deployment, live provider acceptance, physical-device qualification or real-business ML accuracy is claimed.

| Area | Current capability | Remaining boundary |
|---|---|---|
| Authentication/security | Login, refreshed sessions, logout/revocation, profile and authenticated password changes with current-secret verification and session invalidation; current membership/permission checks | Email/SMS recovery delivery lacks an approved configured adapter; safe unavailable behavior remains |
| Warehouse/staff | One Business stock pool, business profile, memberships, staff status and permissions | Separate branches/transfers are outside the selected warehouse model |
| Products | Categories/types/variants, SKU/unit/reorder level, CRUD/archive, tenant lookup, duplicate review, barcode assignment | Duplicate candidate comparison capped at 2,000; legacy contact pickers capped at 1,000 |
| Barcode tools | Tenant item lookup, Code 128 print/Save PDF, local supported-browser camera detection, manual/USB fallback | Physical camera/scanner/printing and installed-PWA behavior require devices |
| Suppliers/brokers | CRUD/active state, permission-aware edit actions, paged search, supplier items, purchase history/statistics, owner price history selection | No external supplier integration claimed |
| Purchases | Server-calculated preview/totals, state/version validation, supplier/item association, receiving/verification/commit, payments and damage review | Historical import is read-only synthetic preview until trusted data mapping/correction contracts are supplied |
| Stock | System/physical stock, adjustments/reconciliation, immutable activity ledger, damage effects, active item paging and category/supplier/severity filters | Single Business warehouse boundary, no location transfer semantics |
| Dashboards/reports | Actual database metrics, authorization-aware stock/purchase/financial sections, supplier and movement reports, explicit load errors | No fake metrics, generated report narrative or learned price/fraud model |
| Exports | CSV/XLSX/PDF/JSON/ZIP, bounded server data, existing financial redaction, new movement/audit/forecast CSV and barcode printing | JSON/business archives are scoped extracts, not substitutes for full database recovery; restore commit deliberately disabled |
| Audit | Transaction-bound mutation provenance with safe old/new fields, owner audit page and export, application immutability guard | Database administrator access and deployment role privileges need operational controls |
| Notifications | Stock thresholds/critical/out-of-stock, discrepancy/reconciliation, purchases/damage, staff and ML events; preferences, unread dedupe and current-permission filtering; reference navigation/retry | External push/delivery and real scheduled deployment behavior are not certified |
| Daily operations | Checklists/templates, confirmed daily consumption, snapshots, staff tasks/performance and rule-based summaries | Generated snapshots are never treated as confirmed zero demand |
| AI | Reviewed purchase intent, invoice text parsing, encrypted provider credentials and configurable failover/model/retry/timeout/circuit | Live accounts/quality/quotas/key ring; true image OCR and voice require provider contracts |
| WhatsApp | Owner preview/confirmation, quantity-only purchase PDF upload/send, durable status/idempotency/concurrency, manual uncertain-outcome recovery | Live provider and recipient/messaging policy verification; accepted is not delivered |
| ML | Offline extract/clean/train/evaluate/save; per-item temporal ridge/baseline selection; scoped serving, advice/anomalies/monitoring and responsive UI | No eligible real dataset supplied, therefore no production model or business accuracy measurement |
| Realtime/PWA | Existing scoped SignalR invalidation and reconnect, public asset/offline connection-required behavior retained | Multi-instance fanout, physical installed PWA and deployment recovery require staging |
| Performance/dependencies | Bounded lists/exports, no request-time training, local inference measurement; upgraded Tailwind toolchain; npm/NuGet audits clean | Representative production dataset/traffic unavailable; Tailwind 4 requires supported modern browsers |

The previous reference audit incorrectly inferred invoice/WhatsApp absence from migration 066. Executable text extraction and delivery code plus later migration 070 were found in both reference copies and integrated where applicable. No generative warehouse-assistant route or real image-to-text engine was established from the historical comments.

Final verification details, commands, counts, skips and limitations are maintained in the readiness report rather than duplicated across historical documents. All known remaining production gates are recorded in the final matrix. Synthetic provider/browser/ML fixtures are verification evidence only.
