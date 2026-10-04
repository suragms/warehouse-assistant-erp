# Final pending feature matrix — Phase 3

Updated 2026-10-04 after implementation and verification. Initial categories are retained for traceability. COMPLETE means the supported local workflow has implementation and automated evidence, not production deployment or external-service qualification.

| ID | Work | Initial category | Final category | Evidence / boundary |
|---|---|---|---|---|
| P01 | Real offline ML pipeline | IMPLEMENT | COMPLETE | Confirmed-usage extraction/cleaning, temporal validation, ridge vs two baselines, held-out gate and artifact management. Synthetic CLI reproducibility and restored PostgreSQL extract/train/serve verified. |
| P02 | Scoped inference, reorder, risk, anomalies, monitoring | IMPLEMENT | COMPLETE | Current membership/stock permission, isolated artifacts, immutable unique snapshots and later complete actuals. Statistical scenarios are not calibrated probabilities. |
| P03 | ML UI and export | INTEGRATE | COMPLETE | Predictions route, paged item search, 7/14/30 days, actual history/forecast, metrics, advice, anomalies, outcomes, loading/error/empty states and server CSV. |
| P04 | ML regression | TEST | COMPLETE | Cleaning, duplicates, zeros, leakage, repeatability, malformed/stale/cross-tenant artifacts, HTTP RBAC, PostgreSQL persistence, browser and component tests. |
| P05 | Supplier history and prices | IMPLEMENT | COMPLETE | Confirmed purchase price history, dated/paged purchase statistics, owner-only optional price selection with unit match. No automatic price application. |
| P06 | Readable immutable audit history | IMPLEMENT | COMPLETE | Owner/SuperAdmin audit page and date/actor/action filters, paged server route, bounded CSV, no ordinary-user mutation route, context immutability guard. |
| P07 | Mutation provenance | FIX | COMPLETE | Safe field allowlist captures actor/Business/entity/action/time/old/new values for catalog, contacts, staff, settings and operations; transactional stock/purchase/damage services retain their audit records. Secrets excluded. |
| P08 | Notifications and revoked access | FIX | COMPLETE | Mutation-driven stock/critical/out-of-stock/purchase/discrepancy/reconciliation/staff/ML alerts, existing damage events, settings, unread dedupe, transactional inserts, current-permission filtering on reads and unread counts, working reference navigation and retry states. |
| P09 | Provider management and resilience | IMPLEMENT | COMPLETE | Encrypted keys, owner policy/model/order, enablement, deadline, bounded retry, tenant-specific circuit, fallback, normalized failures and tests. Live account checks remain P20. |
| P10 | Reports/exports | FIX | COMPLETE | Existing inventory/purchase/supplier/financial/rule-based operations reports plus stock movement, audit and forecast CSV. Database-backed, tenant scoped, filtered/bounded, financially redacted, explicit errors. XLSX/PDF/JSON/ZIP remain supported. |
| P11 | Current membership and direct API denial | TEST | COMPLETE | Owner/staff/custom permission, tenant substitution, stale credentials, financial redaction, supplier items, audit, AI, ML, exports and WhatsApp negative coverage. |
| P12 | Purchase/stock lifecycle | TEST | COMPLETE | Existing preview, totals, receive/verify/commit/payment/damage/concurrency suites retained; delivery history prevents destructive purchase deletion. PostgreSQL regression passes. |
| P13 | Stock filters and reorder entry | INTEGRATE | COMPLETE | Category/supplier/severity plus low/out-of-stock routes, stable active-item paging, same CSV filters, supplier permission and purchase navigation. |
| P14 | Contact/search/duplicate bounds | FIX | COMPLETE | Supplier/broker search and 50-row UI pages; endpoints validate page/size/search and cap legacy pickers at 1,000. Duplicate review rejects over 2,000 candidates rather than running unbounded comparisons. No mutable-stock cache. Representative load still P28. |
| P15 | Responsive regression and build/lint | TEST | COMPLETE | Desktop/tablet/mobile suite plus targeted new workflow checks. Original header pixels preserved; sidebar baseline explicitly reviewed for added Predictions route. No mobile navigation redesign. |
| P16 | PostgreSQL migrations and restore | TEST | COMPLETE | Fresh/restored suites each 61 passes, zero skips; 30 table counts; owner login, stock HTTP write/audit, offline ML pipeline, forecast/export and snapshot dedupe against restored synthetic records. |
| P17 | Final reference and placeholder discovery | TEST | COMPLETE | Both backend and Flutter reference copies scanned; findings below and corrected AI parity report. |
| P18 | Supported Owner/Staff operations | TEST | COMPLETE | Login/logout, profile/password/session revoke, memberships/staff/permissions, products/categories/SKU/units, suppliers/brokers/items, purchases/stock/physical/reconciliation/damage/activity, reports/settings verified in existing and expanded tests. Recovery delivery remains P23. |
| P19 | Warehouse/branch model | COMPLETE | COMPLETE | One Business = one logical warehouse stock pool; membership is access assignment. No separate branches/transfers or per-location balances are claimed. |
| P20 | Live AI key/model/quality verification | EXTERNAL VERIFICATION | EXTERNAL VERIFICATION | Requires approved account, credentials, data terms, shared key ring and deployment egress. |
| P21 | Production backup/restore and release | EXTERNAL VERIFICATION | EXTERNAL VERIFICATION | Synthetic restore passed. Representative staging copy, approved target, RTO/RPO, retention, encryption and rollout qualification unavailable. User-facing restore commit remains explicitly disabled. |
| P22 | Physical devices / installed PWA | EXTERNAL VERIFICATION | EXTERNAL VERIFICATION | Automated viewports are not physical Android/iOS, native keyboard/camera or installed-PWA evidence. |
| P23 | Email/SMS account recovery | BLOCKED | BLOCKED | No configured delivery adapter/provider contract. Safe explicit unavailable behavior remains; authenticated password change/revocation is complete. |
| P24a | Pasted invoice extraction | BLOCKED | COMPLETE | Reference executable code found; deterministic and optional provider parsing, reviewed UI, validation, tenant matching and staff price redaction implemented/tested. |
| P24b | WhatsApp outbound workflow | BLOCKED | COMPLETE | Reference contract ported with owner confirmation, quantity-only PDF, encrypted credentials, persistent state/idempotency/concurrency and interruption recovery; mocked transport verified. Live delivery remains P27. |
| P24c | True image OCR / voice | BLOCKED | BLOCKED | No functioning reference image-recognition engine or approved target voice/image provider contract; plain-text decoding and historical stub comments are not evidence. |
| P25 | Real production ML artifact and accuracy | TEST | EXTERNAL VERIFICATION | No eligible real historical dataset or configured operational DB supplied. No accuracy claim or synthetic production artifact. |
| P26 | Barcode labels and camera | FIX | COMPLETE | Saved tenant item → Code 128 label → print/Save PDF. Local browser camera detection where supported; explicit manual/USB fallback, permission-denial handling and stream cleanup. Browser checks pass; physical device/scanner qualification P22. |
| P27 | Live WhatsApp delivery | EXTERNAL VERIFICATION | EXTERNAL VERIFICATION | Requires enabled deployment, current supported Graph version, approved account/recipient and messaging policy checks. `accepted` only means provider acknowledgement. |
| P28 | Production scale / multi-instance | EXTERNAL VERIFICATION | EXTERNAL VERIFICATION | Local bounded-query/ML smoke verified; no representative traffic, production data or replicas supplied for load/fanout qualification. |
| P29 | Development dependency vulnerabilities | FIX | COMPLETE | Tailwind 4/Vite integration removes prior Tailwind 3 transitive findings; full npm and transitive NuGet audits report no known vulnerabilities. Browser support changes documented. |
| P30 | Historical purchase import | BLOCKED | BLOCKED | Synthetic preview is explicitly labelled; no trusted source-to-target mapping, correction/rounding policy or approved import dataset supplied. No fake import success or writes. |

## Final scan and classification

Scanned target backend/frontend/ML and both reference backends plus both `flutter_app/lib` trees for TODO, FIXME, placeholder, stub, dummy, sample/demo data, disabled actions, empty handlers, coming-soon and not-implemented paths. Generated vendor/build folders and test doubles were separated from production code. Also reviewed route registration and later migrations instead of trusting old notes. Raw local evidence is in ignored `TestResults/phase3-final-*-scan.txt`.

| Finding class | Disposition |
|---|---|
| Target `StubAIProvider` | Intentional non-success fallback; never returns fabricated data. Retained. |
| Input placeholders, loading skeletons, disabled pending/invalid/unauthorized controls | Functional UI states, not unfinished features. Retained. |
| Fake-looking old dashboard defaults | Replaced with explicit unavailable/retry when response metrics are missing; tests now provide complete server-shaped fixtures. |
| Barcode printing and camera help marked unavailable | Implemented supported browser workflows; corrected English/Arabic help and permission visibility. |
| New notification references not handled by UI | Wired purchase, stock, membership, damage and ML references; unknown references do not show a misleading View action. |
| WhatsApp settings said history unavailable | Corrected to point owners to confirmed purchase delivery status. |
| Reference invoice stub comment / `/media/ocr` | Executable text parser ported. Base64-to-UTF8 and hardcoded confidence are not treated as image recognition or model accuracy. |
| Reference migration 066 removal claim | Superseded by later code/migration 070; corrected AI/external documentation. |
| Reference assistant/voice health/script comments | No matching verified active assistant/speech workflow; not used to fabricate parity. |
| Reference SSE stub | Target already uses scoped SignalR; no stub port required. |
| Reference platform-specific barcode stubs | Conditional platform fallbacks; target uses browser feature detection. |
| Reference seed/demo data, sample scripts, preview UUIDs, test mocks | Not imported into production records; historical preview remains labelled synthetic and read-only. |
| Restore commit 501, provider/storage unavailable states | Deliberate truthful deployment/contract gates, recorded above; not silently enabled. |
| Appearance themes, custom report designers, multi-location expansion | No accepted target workflow/contract; no claim that a dark-theme switch or branch inventory exists. Existing visual design is preserved. |

No unresolved target TODO/FIXME or fake production forecast was found in the final source search. This is scoped source/test evidence, not a guarantee of every possible production behavior. The [final readiness report](FINAL_PRODUCTION_READINESS_2026-10-03.md) records exact commands, evidence and remaining gates.
