# Phase 4 final production verification

**YELLOW — Production Candidate.** Local core workflows, migration/recovery, security regressions and controlled load pass. Real ML input, live accounts, production topology and physical devices are not available. No known critical application defect remains in the exercised scope; this is not certification of an untested production deployment.

## Newly implemented

Owner historical-consumption CSV preview/import with source attestation, row validation/errors, protected confirmation, immutable raw/observation provenance and transactional audit; stock stays unchanged. Added tenant/unit-safe historical extraction, chunked queries and measured extraction counts, cohort/per-unit evaluation reports, compiled-pipeline code fingerprints, candidate-only training, expected-version promotion with chronological improvement gates and retained rollback. Added complete-outcome monitoring metrics and review alerts. Corrected Gemini/Groq model overrides, permanent error retries, bounded upstream backoff, credential redirects and oversized-response handling. Optimized the measured anomaly CPU path while retaining causal results. Extended private recovery/model-asset/HTTP/load/query-plan tooling and regression coverage. Existing mobile navigation/layout is preserved.

## Verification matrix

| Area | Status | Evidence | Remaining Action |
|---|---|---|---|
| Backend | GREEN | 493 unit/HTTP tests; Release build, zero errors/warnings | Qualify release in production topology |
| Frontend | GREEN | 118 component tests; production build/lint; 224 full browser tests | Deployment browser/device qualification |
| Database | GREEN | Latest migration; 66 fresh + 66 restored PostgreSQL tests; 32 table counts/invariants | Production-copy restore/retention qualification |
| Auth | GREEN | Real restored owner login; session/expiry/revocation/unauthenticated checks | Live TLS/cookie/proxy/key-ring qualification |
| RBAC | GREEN | Current membership/permission and Owner import policy; negative role checks | Verify deployment identity/configuration |
| Tenant isolation | GREEN | Scoped queries/artifacts, substituted IDs denied, composite foreign keys | Business remains the single warehouse boundary |
| Inventory | GREEN | Versioned HTTP stock write, ledger/audit invariants, no import stock changes | Representative operational acceptance |
| Purchases | GREEN | Lifecycle/financial tests; 24 real preview/create load cycles; restored lines | Representative operational acceptance |
| Reports | GREEN | Authorization/redaction/export coverage, restored reports and query plans | Production-scale report qualification |
| AI | YELLOW | 67 named AI/provider tests; four model/error/bounds contracts; graceful unavailable/throttle | Authorized live accounts/models/keys and quality/latency checks |
| ML | BLOCKED | 31 ML core/import/anomaly tests, HTTP/PG serving tests and reproducibility; guarded promotion | Eligible real historical data, evaluation and approved production artifact |
| Notifications | GREEN | Existing policy/dedupe/navigation coverage retained; browser regression passes | Production realtime fanout qualification |
| Recovery | YELLOW | Private restore/model checksum/HTTP workflows; 18.083 s measured local recovery | Actual backup assets, key ring, topology, RPO/RTO and retention |
| Load testing | YELLOW | 264 requests, 4 clients, 0 unexpected errors; measured plans/CPU/memory | Representative production traffic/soak/multiple instances and agreed targets |
| Security | GREEN | 267 named security regression cases; new import/provider boundaries; dependency audits clear | Production secret/TLS/egress/key-ring qualification |
| Mobile | YELLOW | Responsive/browser/PWA/keyboard/camera-fallback regression; no redesign | PHYSICAL DEVICE VERIFICATION PENDING |
| External providers | BLOCKED | Contract inventory and truthful unavailable behavior; no live success simulated | Approved AI/WhatsApp accounts and required OCR/voice/recovery contracts |

GREEN rows describe the exercised local code/workflow scope. The overall production status remains YELLOW because the remaining deployment/data/provider/device gates are not verified.

## ML evidence and deployment boundary

Real data available: **no**. Real dataset size/items/warehouses/source/evaluation period: unavailable. No eligible CSV/workbook, `ML_DATABASE` connection or application local secret store was present. Reference contact CSVs are not consumption. No real production artifact was trained, replaced or promoted.

The implemented model remains per-item standardized ridge versus seven-day mean and seasonal-7 baselines, using lag 1/7/14, mean 7/28 and weekday sine/cosine. Chronological validation and holdout are 30 days each; per-unit/volume/intermittent reports do not pool incomparable quantities. Current-versus-retrained comparisons require untouched dates and record version/code/data/feature/time/metrics. Synthetic verification still uses 180 days, one item/Business, validation 2026-08-04–09-02 and holdout 2026-09-03–10-02. MAE 0.1277 versus 2.8 is **synthetic mechanics evidence only**, never real-business accuracy or production model approval.

**ML pipeline is production-capable but production model validation is blocked by absence of eligible historical business data.** See [updated model card](ML_MODEL_CARD_2026-10-03.md) and [data/promotion contract](HISTORICAL_CONSUMPTION_AND_MODEL_PROMOTION_2026-10-04.md).

## Exact tests and build evidence

| Verification | Result | Local log / reproduction |
|---|---|---|
| Backend unit/HTTP | 493 passed, 0 failed/skipped | `phase4-unit.log`, `phase4-unit.trx`; `dotnet test backend/PurchaseAssistant.UnitTests -c Release` |
| Frontend | 118 passed, 0 failed/skipped | `phase4-frontend.log`; `npm test` in frontend |
| Fresh PostgreSQL | 66 passed, 0 failed/skipped | `phase4-postgres.log`; guarded fresh integration script |
| Restored PostgreSQL | 66 passed, 0 failed/skipped | `phase4-restore-load.log`; guarded restore script with `-RunLoad` |
| Full browser | 224 passed, 0 failed/skipped | `phase4-browser.log`; `npm run test:e2e` |
| Targeted browser | 28 passed, 0 failed/skipped, overlapping the full run | `phase4-targeted-browser.log`; completion, barcode, notification, realtime and historical-consumption files |
| ML core/import/anomaly | 31 passed, included in backend | Named TRX subset; serving/monitoring additionally covered in HTTP/PG/browser |
| AI/provider-focused | 67 passed, included in backend | Named TRX subset, including transport/model/resilience/invoice checks |
| Security-focused | 267 passed, included in backend | Named TRX subset, not an additional independent suite |
| ML reproducibility | Passed; two runs identical parameters/versions/metrics | `phase4-ml-repro.log`; synthetic-only reproducibility script |
| Backend Release build | Passed, 0 warnings/errors | `phase4-backend-build.log` |
| Frontend build/lint | Passed, zero lint warnings | `phase4-frontend-build.log`, `phase4-lint.log`; targeted browser rebuild also passes |
| Dependency advisories | Zero known npm vulnerabilities; no vulnerable NuGet packages in nine solution projects | `phase4-npm-audit.json`, `phase4-nuget-audit.log`; current advisory feeds |

Logs are ignored under `TestResults`. `python scripts/summarize-phase4-tests.py` counts actual TRX results and records exact members/selection criteria in `phase4-test-groups.json`. These named coverage subsets overlap and are not added to backend totals. Full/targeted browser counts are also not summed. Existing baselines are retained and expanded. Failed intermediate harness attempts exposed a version-identifier parsing mistake and an incorrect catalog route in the test tool; both are corrected and excluded from successful counts.

## Recovery, load and database measurements

Latest complete run `d95d78d9d06f4ca1b92e937b32b810f6`: backup 0.346 s, restore 0.840 s, integrity 3.063 s, application verification 5.330 s, restore-to-verified 18.083 s. All 32 tables and restored model bytes match. Real HTTP import commits once, rejects repeat and leaves stock unchanged. This is a private synthetic rehearsal, not an agreed production RTO/RPO. [Recovery evidence](PRODUCTION_RECOVERY_REHEARSAL_2026-10-04.md).

Four clients completed 264 HTTP requests in 4.487 s (58.84/s), median/p95/p99 18.87/467.35/604.01 ms; zero unexpected failures. Nine AI responses explicitly report unavailable and 15 expected responses enforce HTTP 429. API CPU was 14.69 CPU-seconds; peak working set 239.60 MiB. Login hashing dominates latency; it was not weakened. Measured ML median/p95 fell from 186.47/313.79 to 41.29/107.35 ms after the causal rolling-history optimization; host activity was uncontrolled, so no guaranteed speedup is claimed. Representative SQL samples executed in 0.151–2.786 ms, with no speculative indexes. Extraction of 2,005 items used 43 queries. [Load/query-plan evidence and limitations](LOAD_AND_DATABASE_VERIFICATION_2026-10-04.md).

## Security and final scan

Reviewed current membership/session expiry/revocation, role/permission enforcement, Business warehouse/ID substitution, authorized exports/financial fields, immutable audit/predictions/import provenance, tenant AI/ML access, encrypted secrets, bounded CSV/image/invoice input and provider transport. New findings have regression coverage: Gemini/Groq ignored model configuration; providers retried permanent errors; default AI redirects could forward a custom credential header; response buffering was not bounded. These are corrected. No inbound WhatsApp delivery webhook is registered and external input cannot assert delivery. Optional OCR/voice/recovery absence degrades explicitly rather than blocking core operations.

Final scans cover target sources, deployment/scripts/docs/public assets and both reference backend/Flutter trees, excluding generated/vendor/ignored result data. Findings are classified in [static scan report](FINAL_STATIC_SCAN_2026-10-04.md). Input hints/skeletons, normalized preview samples, negative stub fallback, test doubles and historical examples are retained. No fake production prediction, fabricated provider success or unresolved target TODO/FIXME was found. No actual secret was printed or committed. Advisory/source review is scoped evidence rather than proof against every possible deployment threat.

## Genuine remaining requirements

1. Eligible, owner-approved historical consumption and real per-item/current/baseline/retrained evaluation before ML deployment.
2. Authorized AI accounts/keys/models and live checks; approved WhatsApp account/recipient/document receipt and account messaging-policy qualification. **LIVE EXTERNAL VERIFICATION REQUIRED.**
3. Approved image OCR, speech and email/SMS recovery contracts/accounts if required; no provider or response contract is invented. [Exact provider inventory](EXTERNAL_PROVIDER_CONTRACTS_2026-10-04.md).
4. Production/staging topology and representative data/traffic: migration rollout, database/model/key-ring backups, retention/encryption, RPO/RTO, TLS/proxy/cookies, private artifact storage, extended load and multiple-instance operation.
5. Physical Android/iOS, installed PWA, camera/scanner/printer/native keyboard evidence. **PHYSICAL DEVICE VERIFICATION PENDING.**

The local hardening work is complete. These remaining items require data, credentials/contracts, infrastructure or hardware, so GREEN production certification would overstate the evidence.
