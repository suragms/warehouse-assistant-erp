# Final production readiness — Phase 3

Historical verification snapshot. The [Phase 4 report](FINAL_PRODUCTION_VERIFICATION_2026-10-04.md) records newer hardening, tests, measured recovery/load and remaining environmental gates. Phase 3 counts below remain historical evidence.

Updated 2026-10-04. **YELLOW — Production Candidate.** Local feature implementation and regression gates are verified; external accounts, real ML data and production-environment qualification remain. This is not approval to deploy synthetic data or a claim of live delivery.

## Delivered

- Offline consumption forecasting with data validation, temporal validation/holdout, two baselines, deterministic ridge selection, checksummed artifacts, scoped inference, stockout scenarios, reorder advice, statistical movement flags and prediction outcomes.
- Predictions UI, per-item history/metrics, explicit unavailable/error states, notifications and bounded server CSV.
- Supplier purchase history/statistics and owner price suggestions; contact paging; permission-aware supplier/broker actions; stock category/supplier/severity filters.
- Transaction-bound mutation audit, owner audit search/export, immutable history, current-permission notification filtering, event coverage, dedupe and working record navigation.
- Provider activation/order/models/retry/deadline/circuit policy, reviewed invoice text extraction, authenticated password change and session revocation.
- Confirmed owner WhatsApp quantity-PDF delivery with persisted attempts/status, concurrency/idempotency and explicit unknown-outcome recovery. No live message sent.
- Code 128 barcode labels through browser print/Save PDF and local camera detection with manual fallback where the API is unsupported.
- Tailwind 4 migration removing prior development dependency findings while preserving the mobile shell and original desktop neutral styling.

## Validation evidence

All baseline tests were retained. Commands run from the repository root unless noted. Logs/artifacts are ignored under `TestResults/` and can be regenerated.

| Gate | Result | Evidence / command |
|---|---|---|
| Backend unit/HTTP endpoint | 431 passed, 0 failed, 0 skipped | `dotnet test backend/PurchaseAssistant.UnitTests -c Release`; `phase3-unit.log` |
| Frontend component | 112 passed, 0 failed, 0 skipped | `npm test` in frontend; `phase3-frontend.log` |
| PostgreSQL fresh migrated private DB | 61 passed, 0 failed, 0 skipped | `pwsh -File scripts/run-postgres-integration-tests.ps1`; `phase3-postgres.log` |
| PostgreSQL restored private DB | 61 passed, 0 failed, 0 skipped | `pwsh -File scripts/run-postgres-restore-rehearsal.ps1`; `phase3-restore.log` |
| Full browser regression | 218 passed, 0 failed/skipped | `npm run test:e2e` in frontend; `phase3-browser.log` |
| Final scoped browser regression | 17 passed, 0 failed/skipped | `phase3-final-targeted-browser.log`; includes two new notification cases plus overlapping barcode/prediction/realtime/help checks |
| ML reproducibility | Passed: two independent offline CLI runs have identical parameters, versions and metrics | `pwsh -File scripts/verify-ml-reproducibility.ps1`; `phase3-ml-repro.log` |
| Backend Release build | Passed, zero errors/warnings | `dotnet build backend/PurchaseAssistant.slnx -c Release`; `phase3-backend-build.log` |
| Frontend production build | Passed, including latest browser-run build | `npm run build`; `phase3-build.log` and browser webServer gate |
| Frontend lint | Zero warnings | `npm run lint`; `phase3-lint.log` |
| Full npm audit | 0 known vulnerabilities | `npm audit --json`; `phase3-npm-audit.json` |
| NuGet direct/transitive audit | No known vulnerable packages in all nine solution projects | `dotnet list backend/PurchaseAssistant.slnx package --vulnerable --include-transitive`; `phase3-nuget-audit.log` |

The full browser suite uses API fixtures and Edge, covering widths 320 through 1920, including tablet. It checks routing, role visibility, dialogs, keyboard reachability, overflow, errors, filters, downloads and realtime invalidation. Nine desktop baseline cases were regenerated only after visual review: header remained identical; the sidebar adds Predictions. Barcode print output was inspected visually. Physical-device and printer/scanner accuracy are not certified.

The final scoped browser run covers the latest notification navigation/error changes and the barcode rendering cleanup. Report full-run and scoped-run counts separately; overlapping tests must not be added together as distinct passes. Initial test failures from outdated role fixtures, dashboard fixture shapes, changed help text and automatic-query retry timing were corrected; failed attempts are not counted as passes.

## Restored-database and ML evidence

The loopback-only private PostgreSQL harness uses random temporary `wa_test_*` databases and a dedicated test role, never a developer/production database. Startup handle inheritance was fixed so redirected Windows runs finish and clean up safely.

The restore rehearsal migrated source/target, seeded synthetic domain data and 180 explicitly synthetic usage days, dumped/restored custom format, and matched all 30 table row counts and domain invariants. It then verified a real Owner login, a stock adjustment through HTTP, persisted ledger/audit effects, offline extraction/training, authenticated forecast and CSV, unique prediction snapshots and unauthenticated 401. All 61 integration tests passed against the restored target. This is stronger than fixture-only browser evidence but is not a production-copy restore.

Twenty sequential warm HTTP inferences on the synthetic restored item measured median 20.5ms and p95 25.5ms on this local host in the recorded rehearsal. This small single-item result checks serving mechanics; it is not representative load, throughput, multi-instance capacity or a latency SLA. Query bounds are enforced for stock/contact/item lists, duplicate review, anomaly history, monitoring and exports. Training is never performed in a normal request.

## Security review

- Authentication/current membership/session revocation, custom permission denial, tenant ID substitution and financial redaction are covered by existing and expanded endpoint tests. Business is the supported warehouse boundary.
- ML item/history/artifact/snapshot access is explicitly tenant-scoped; no model paths or provider secrets are returned. Staff receives authorized operational quantities without owner prices.
- Important mutations retain transaction-bound provenance; safe field allowlists exclude passwords, credential ciphertext, tokens and prompt bodies. Audit/ledger/prediction history is immutable through the app. Database administrator privileges remain an operational boundary.
- AI output is advisory; validated tenant lookup replaces supplied IDs, prompts cannot invoke mutation tools, and normal purchase validation/preview is still required. Invoice input/response and provider responses are bounded.
- WhatsApp is Owner/SuperAdmin-only, fixed-host HTTPS with redirects off, owner-confirmed current recipient/order, quantity-only PDF and no automatic resend. External acceptance is not falsely marked delivered.
- Exports keep server authorization, tenant filtering, row caps, formula-safe CSV handling, financial masking and no-store responses. Barcode printing uses only the already-authorized saved item and locally bundled encoding.
- React text rendering, validated URLs, existing private image upload checks, origin protections and parameterized EF queries remain. No new arbitrary URL fetch or executable artifact deserialization was added. Dependency audits are advisory-source checks, not a guarantee of no vulnerabilities.
- Notification recipients/settings are checked at creation and sensitive resource permissions are rechecked on reads, including system notifications with resource references.

## Deployment and remaining gates

1. Provide approved real confirmed daily usage; train and evaluate per-item models against the baseline before installing artifacts. Real production accuracy is not measured. See [model card](ML_MODEL_CARD_2026-10-03.md).
2. Verify AI account/model/key/quotas/output quality and the persistent shared Data Protection key ring. Enable WhatsApp only with supported Graph version, approved recipient/account and verified messaging requirements. See [external verification](EXTERNAL_AI_OCR_VERIFICATION.md).
3. Choose/configure delivery contracts for email/SMS account recovery, true image OCR and voice if those features are required. These are explicitly unavailable, not simulated. Historical import also needs trusted source data and correction/mapping rules.
4. Qualify a representative staging/production-copy restore, retention/encryption, migration/rollback window, RTO/RPO, live TLS/cookies/proxy and multi-instance realtime/load. The app restore-commit endpoint remains deliberately disabled.
5. Verify Android/iOS hardware, installed PWA, native keyboards, camera/scanner and printed labels. Tailwind 4's documented minimum targets include Safari 16.4, Chrome 111 and Firefox 128; see [official upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

New migrations add confirmed usage/prediction snapshots, provider policy, purchase delivery and the unique prediction snapshot index. Apply them through the existing reviewed deployment migration process. Configure private `ML__ArtifactPath`; restrict writes to the offline operator. Back up model artifacts and the key ring separately from database backups. Do not deploy the ignored synthetic verification model.

All categories and explicit contract boundaries are in the [final matrix](FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md). GREEN requires evidence for the relevant production gates above.
