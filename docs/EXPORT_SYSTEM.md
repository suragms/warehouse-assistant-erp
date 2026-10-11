# Export system: implemented contracts and verification

Implementation follow-up: **2026-10-11, Asia/Calcutta**. This document supersedes the export proposals in the 2026-10-10 audit. The audit remains historical evidence. Existing barcode and database recovery work was preserved. No production migration, restore, deployment, outbound delivery, or inventory mutation was performed for this work.

## User workflow and supported surface

Open **Settings → Export & Backup** (`/settings/backup`). The Export Center offers a category, an individual report, PDF/CSV/XLSX, UTC dates where applicable, and a supported status filter. Forecasts additionally require an item and horizon. Reports are independently downloadable; the center does not assemble every domain into one PDF. Reports and Purchase Detail also link into this workflow. Existing individual and batch barcode printing remains in Items and Barcode Manager.

The center displays loading, preparation, success, validation, unavailable-model, network-error, retry, and empty states. Its history is the current user's last 50 successfully **generated** reports in the selected business. Generation does not prove that a browser saved or printed the file. This is a synchronous, bounded download workflow, not a background job queue.

Source paths in this document are repository-relative:

- `backend/PurchaseAssistant.Web/Controllers/ExportsController.Reports.cs`: authenticated catalog, files, history, validation, permissions, projections, snapshot, limits and audit.
- `backend/PurchaseAssistant.Web/Controllers/ExportsController.cs`: existing class-level policies, financial role contract, and retained legacy routes.
- `backend/PurchaseAssistant.Infrastructure/Services/ExportFileBuilder.Reports.cs` and `ExportFileBuilder.cs`: shared PDF, styled OpenXML XLSX and CSV encoding.
- `frontend/src/components/ExportCenter.tsx`, `pages/BackupPage.tsx`, `components/ExportControls.tsx`, `pages/PurchaseDetail.tsx`: navigation and individual report controls.
- `frontend/src/api/reportExportsApi.ts`, `exportDownload.ts`, `exportsApi.ts`, `components/ServerDownload.tsx`, `components/CsvExportButton.tsx`: existing API client integration, guarded download flow and compatible legacy actions.

## Report and permission matrix

Every row below supports **separate PDF, CSV and XLSX** through `GET /api/v1/exports/reports/files/{id}.{format}`. All inherit authenticated selected-business `RequireReportsView` and the existing Owner/Admin/Manager/SuperAdmin export role list. Additional policies are cumulative. Financial file values preserve the existing **Owner/SuperAdmin** contract; Admin does not gain financial file access merely because JSON financial screens have a different contract.

**VERIFIED COMPLETE** here means the stated, bounded software contract passed content and security checks. It does not certify production models, Linux deployment, or physical hardware.

| ID / report | Classification | Existing domain source and implemented behavior | Filters / additional access | Required evidence executed |
|---|---|---|---|---|
| `catalog` — inventory and catalog | VERIFIED COMPLETE | `CatalogItem`, Category; saved SKU/name/category/unit/barcode/activity. Missing barcodes remain unassigned. | Active/all/inactive, search/category; `RequireCatalogView`. | Three-format content, empty rows, foreign tenant exclusion, no stock change. |
| `stock` — current stock | VERIFIED COMPLETE | Active `CatalogItem` balances: system/physical/reserved/available/reorder and saved unit. No total across mixed units. | Current snapshot, search/category; `RequireStockView`. | PostgreSQL balance reconciliation, all three formats, boundaries/limits/security. |
| `valuation` — stock valuation | VERIFIED COMPLETE | `IReportService.GetStockAnalyticsAsync`, `ReportService.cs`; same current cost estimate and unpriced counts as Reports, including inactive catalog items. | Current snapshot; stock view + financial contract. | Actual report service, estimates and unpriced behavior; tenant/role guards. |
| `low-stock` — reorder alerts | VERIFIED COMPLETE for existing selection | `StockService.Csv.cs.GetCsvRowsAsync("low-stock")`; active available > 0 and <= reorder. Out-of-stock excluded, as in this existing query. | Current snapshot, search/category; stock view. | SQL eligibility/quantities, empty and nonempty formats. |
| `movements` — stock movement history | VERIFIED COMPLETE | Tenant `StockMovements` with item/type/delta/before/after/actor/reason. Read-only saved history. | UTC period, item/actor; stock view. | Content, dates, tenant isolation, ledger and balance immutability. |
| `audit` — business audit event index | VERIFIED COMPLETE for safe index | Tenant `SecurityAuditLogs`: timestamp, actor, event type. Raw descriptions and metadata deliberately excluded. | UTC period <= 366 days, actor/action; Owner/SuperAdmin. | Hostile secret metadata absent in every format; date/role/tenant tests. |
| `purchases` — purchase orders | VERIFIED COMPLETE | Saved `Purchases`/`PurchaseItems`/Supplier/CatalogItem; order/date/status/item/unit/ordered/received; line money only for Owner/SuperAdmin. Individual Purchase Detail supplies the saved purchase ID and its creation timestamp. | UTC creation period, status/supplier; purchase view. Specific purchase ID supports actual Draft/Cancelled status. | Original identifiers, units, lines/header totals, foreign ID denial, quantity-only projections. |
| `purchase-summary` — purchase summary | VERIFIED COMPLETE | `IReportService.GetPurchaseSummaryAsync`: supplier/category/status grouping, matching Reports. | UTC creation period; purchase view + financial contract. | Source and sibling-format reconciliation; correct category semantics. |
| `spend` — purchase spend | VERIFIED COMPLETE | Existing report service daily spend; stored GrandTotal, not a fabricated cash-payment history. | UTC creation period; purchase view + financial contract. | Raw decimal reconciliation and defined totals, date range, empty cases. |
| `suppliers` — supplier directory | VERIFIED COMPLETE | Saved Supplier name/phone/address/activity; no extra personal fields or invented identifiers. | Active/all/inactive, search; supplier view. | Actual contacts, permissions, tenant scoping, three formats. |
| `supplier-purchases` — supplier purchase balances | VERIFIED COMPLETE | Saved order GrandTotal/PaidAmount/nonnegative outstanding, matching `PurchaseService` RemainingAmount. No dated installment ledger claimed. | UTC creation period, supplier; supplier view + purchase view + financial contract. | SQL totals, overpaid historical order regression, three formats. |
| `brokers` — broker directory | VERIFIED COMPLETE | Saved Broker name/activity. No commission ledger is invented. | Active/all/inactive, search; broker view. | Directory rows/empty/security checks. |
| `delivery` — purchase lifecycle | VERIFIED COMPLETE | Saved Created/Confirmed/Dispatched/Arrived/Verified/Completed timestamps and actual status. Missing timestamps stay unavailable. | UTC creation period/status/supplier; purchase view; includes Draft and Cancelled. | Lifecycle content, status/date scope, three formats. |
| `dashboard` — operational summary | VERIFIED COMPLETE for persisted metrics | Existing `IDashboardService` purchase/stock/delivery metrics. Financial metric only for Owner/SuperAdmin. | Current snapshot; purchase view + stock view. | Real service metrics, role redaction, tenant and empty fixture checks. |
| `backup-history` — business export history/status | VERIFIED COMPLETE | Tenant `BackupLogs` timestamp/run/status/size/duration. This is the existing business JSON export history, not native recovery archives. | UTC period; inherited report permission. | All formats; no paths, errors, secrets, or archive contents. |
| `database-backups` — database recovery status | VERIFIED COMPLETE for operator metadata | `DatabaseBackupJobs` kind/status/times/size/verification/offsite state. Explicitly titled platform recovery across all businesses. | UTC period; existing `RequireDatabaseBackup` deployment operator policy. | Three-format operator checks and secret exclusion; Owner alone is denied. |
| `comparison` — period comparison | VERIFIED COMPLETE | Existing `IReportService.GetPeriodComparisonAsync`, current inclusive period and previous period ending exclusively at current start. | UTC period; purchase view + financial contract. | Service totals, eligible statuses, no overlap, sibling formats. |
| `forecast` — real item forecast | VERIFIED COMPLETE for ready-model export; production model qualification BLOCKED | Existing tenant-aware `MlService.AnalyzeAsync`: ready model only, actual forecast and scenario bounds, model version/training time/unit. | Item, horizon 7/14/30; stock view; 15-second deadline. | A genuine model trained from isolated test observations; all formats match model output; foreign/not-ready/error tests. |

API-only search/category/supplier/item/actor/action filters are validated per report; the center currently exposes the common category, period, status, format and forecast controls. Incompatible filters return a validation error rather than being silently ignored. The report selector contains only definitions authorized by the server.

`GET /api/v1/exports/reports` supplies that catalog, formats, UTC, the 5,000-row budget and missing-capability notes. `GET /api/v1/exports/reports/history` returns only the current user and business's content-free generation history. The `/files/` segment preserves the existing `/exports/reports/suppliers.csv` and `/items.csv` routes.

## Calculations and boundaries

- Stock and valuation are **current snapshots**. Date controls are disabled and the server rejects date filters for them. Historical opening balances and historical valuation cannot be reconstructed from this feature.
- Reporting purchases exclude Draft and Cancelled. Lifecycle includes them. A requested individual purchase retains its actual status and original ID. Purchase periods use saved `CreatedAt`, not an invented invoice/delivery/payment date.
- Supplier/status summary spend uses order GrandTotal. Category summary uses line totals and excludes header charges; category purchase counts can overlap. Do not sum different groupings or treat category totals as order totals.
- Purchase header notes reconcile orders, GrandTotal, PaidAmount and outstanding. Outstanding is `max(0, GrandTotal - PaidAmount)`, preserving the on-screen convention for old overpaid orders; saved values/history are not rewritten. Totals sum stored decimals before two-decimal INR display rounding.
- Current stock and dashboard count rules differ from the stock valuation service's inactive-item inclusion; each report states its source semantics. Quantities retain saved units and are not aggregated across incompatible units.
- The browser date helper validates calendar dates and sends a complete UTC day through `23:59:59.999999Z`, matching PostgreSQL microsecond precision. Report PDFs and spreadsheets state UTC; no business timezone is silently inferred.
- Financial/analytics reports reuse existing services. Multi-query relational reports execute under PostgreSQL repeatable read; the transaction is committed and disposed before the export audit write. PostgreSQL regression checks verify this sequence.

## File layout, encoding and dependencies

PDFs use the existing SkiaSharp 4.153.1 backend, augmented with matching SkiaSharp.HarfBuzz and native HarfBuzz assets. Noto Sans, Noto Sans Malayalam and Noto Sans Arabic fonts are embedded, with OFL licensing in `backend/PurchaseAssistant.Infrastructure/Fonts/OFL.txt`. Font licensing is copied on publish. No commercial PDF/Excel dependency or architecture replacement was introduced. `PdfPig` is test-only for content extraction.

The shared measured-width renderer provides title, business, report type, generation timestamp, period, filters/notes/totals, repeated headings, page numbers and counts, readable column weights, wrapping, and explicit empty-state text. It chooses A4 landscape for wide tables and portrait otherwise. Normal rows are kept together; an oversized cell continues across pages without losing its end marker. It does not fetch external HTML, URLs or fonts.

PDF coverage is **PARTIAL for arbitrary Unicode**: Latin/accented text, Greek, Malayalam and Arabic are tested; scripts/glyphs outside the embedded fonts fail with an actionable request to use CSV/XLSX. Unsupported text is not silently removed or represented as tofu. CSV/XLSX preserve Unicode, including supplementary characters such as emoji; invalid XML controls are removed from XLSX. Adding further PDF scripts requires licensed fonts, appropriate shaping, extracted-content and visual tests.

CSV preserves existing UTF-8 encoding and correct quote/comma/newline escaping. Strings beginning with spreadsheet formula markers after whitespace are prefixed safely; actual numeric negative values remain numeric. New report CSVs contain one consistent header and data rows, without variable metadata preambles. PDF and XLSX carry the reporting metadata.

XLSX reuses the existing framework ZIP/OpenXML builder, now with typed date/decimal/numeric cells, UTC date and INR number formats, bold/frozen headings, wrapping and readable widths. Strings are literal inline cells; no formulas or external relationships are generated. Each new report has a separate **Report information** sheet with business/title/time/period/notes and correctly defined totals. Empty files retain their headers and metadata.

New exports are bounded to 5,000 result rows, 2 MB of text, 32,767 characters per cell and 32 MB generated bytes. Purchase inputs are guarded before materialization at 2,000 orders/5,000 lines. PDF rendering also has a 500-page ceiling. Large-range requests produce useful limit errors; exports are buffered within these limits, not streamed or falsely labeled complete after truncation. Legacy formats retain their existing contracts, with shared download and renderer improvements.

## Security, desktop behavior and history

Business identity comes from the authenticated current-user context, never a supplied tenant ID. Tenant queries and resource policies remain authoritative on the server. FileResult does not pass through JSON money redaction, so the controller applies financial checks before building bytes. Operator database status is the explicit, existing platform-scoped exception, protected by its deployment allowlist policy and clearly labeled.

Audit exports contain an allowlist of fields. Backup status reports omit paths, credentials, errors, keys, hashes and archive contents. Successful report generation appends existing immutable `SecurityAuditLogs` metadata `{ report, format, rowCount }`; failures do not claim a generated report. No export modifies stock, purchases, movements, item identifiers or recovery archives.

The common browser download helper checks authentication, user, business, role and permissions before the request and again before saving delayed bytes. Logout, tenant changes and privilege changes discard the result. It uses the existing Axios client, sanitized server filenames, an appended temporary download link and delayed object-URL cleanup, with useful JSON-blob and network errors. Existing CSV/PDF/XLSX/JSON/ZIP download buttons share this protection. Financial CSV buttons now match their existing stricter server contract; selected purchase clipboard CSV retains its existing screen permission and safely handles whitespace-prefixed formulas.

No Electron/Tauri/native shell exists (`frontend/package.json`, `layouts/AppShell.tsx`, PWA manifest/service worker). Desktop save destination follows the browser's download preferences. Native save-file dialogs are **MISSING by design in this browser application**; fabricated filesystem APIs were not added. PDFs print through the browser viewer. Barcode labels remain separate browser-print documents via `BarcodeTools.tsx` (`BarcodeLabel`/`BarcodeLabels`), preserving validated CODE128, readable item/value text and no-stock-change reprints.

## Verification ledger

All results below are executed checks on Windows. Browser checks use mocked API fixtures and qualify UI behavior; actual endpoint content/security and PostgreSQL calculations are covered separately. A downloaded-file signature alone was not treated as sufficient proof.

| Check | Executed result / evidence |
|---|---|
| Backend unit and HTTP endpoint suite | **703 passed, 0 failed, 0 skipped**; includes all ordinary reports × three formats for populated and empty fixtures, resource/financial/operator permissions, tenant isolation, incompatible filters, individual IDs, date ranges, 5,001-row rejection, personal history, balances and actual ready-model output. Source: `UnitTests/AI/ReportExportEndpointTests.cs`. |
| PDF/CSV/XLSX content suite | `UnitTests/Services/ReportFileBuilderTests.cs`: PDF text via PdfPig, all 120 long rows across 20 pages with repeated headers/page counts, oversized cell end marker, empty states, shaping, unsupported glyph error, typed Excel values/metadata, Unicode/emoji, safe literal formulas, CSV escaping and numeric precision. |
| Disposable PostgreSQL integration | **79 passed, 0 skipped** through `scripts/run-postgres-integration-tests.ps1`. New `IntegrationTests/Stock/ReportExportIntegrationTests.cs` verifies 16 actual SQL projections, totals/current balances/ledger immutability, transaction disposal before audit, and the last UTC microsecond. This direct-controller SQL test uses a policy stub; HTTP authorization is tested separately. Existing guarded migrations/model and barcode/backup suites ran in the private cluster. |
| Frontend unit suite | **171 tests, 22 files passed**, `npm test`; includes `ReportExportApi.test.ts`, `ExportCenter.test.tsx`, `ExportContracts.test.ts`, `CsvExportButton.test.tsx`. Delayed role/tenant/logout downloads are discarded. |
| Edge headless browser checks | **62 passed**: `export-center.spec.ts` (4), `operations-settings.spec.ts` (49), `barcode-tools.spec.ts` (6), `database-backups.spec.ts` (3). Narrow/desktop center, validation/network error, downloaded filename/history, labels and existing navigation qualified. |
| Independent output validation | **21 synthetic PDFs / 40 rendered pages** reviewed with Poppler, seven contact sheets and full-page inspection; no clipping/overlap in covered fixtures. **18 XLSX** opened with openpyxl, Report/Report information sheets and absence of formulas checked. **18 CSV** parsed with Python csv and consistent column counts checked. Test-only artifacts are ignored under `tmp/pdfs/export-qa/`. |
| Builds / lint | Backend Release build passed with **0 warnings/0 errors**; frontend TypeScript/Vite production build and lint passed without diagnostics. No production migration was needed for exports. |

## Remaining gaps and dependencies

| Finding / status | Actual gap and source evidence | Dependency / proposed change | Security implications and required qualification |
|---|---|---|---|
| Historical stock/valuation — MISSING | Only current saved balances and existing current-cost report are exported; no trusted historical opening snapshot contract exists here. | A separately specified, persisted historical balance/cost model before a historical report. | Do not fabricate openings or rewrite movements. Reconcile historical snapshots and tenant dates before adding formats. |
| Payment and broker commission ledgers — MISSING | Purchases store aggregate PaidAmount; directory export uses Broker name/activity. No separate dated event ledger is implemented by this task. | Persisted event schema/business rules and existing authorized page, then export reuse. | No invented payment dates/commission facts; additive migrations and accounting reconciliation required. |
| Global Admin financial parity — PARTIAL existing policy contract | JSON screens and financial file routes differ in `OwnerFinancialResultFilter.cs` versus `ExportsController.Money`; original E02 audit remains a policy decision. New UI follows actual file permission. | Explicit product/security decision and coordinated server policy changes in a separate scope. | Do not broaden financial access implicitly. Add whole role/permission matrix before changing contract. |
| Full audit details — PARTIAL intentional safe scope | New report is an event index, omitting raw text/metadata that can hold secrets. | Approved field-level redaction/schema if richer reports are required. | Adversarial secret/privacy fixtures; existing authorized audit page remains separate. |
| Arbitrary-script PDF — PARTIAL | Embedded fonts cover tested scripts, not universal Unicode. | Further licensed fonts/shaping and language qualification. | Reject unsupported PDF clearly; CSV/XLSX retain complete valid text. Render every new script with long/RTL names. |
| Deployment-native PDF assets — BLOCKED qualification | Linux native packages are declared; execution here was Windows only. | Actual Linux deployment image and font/native-library smoke test. | Verify PDF creation/content/rendering under deployment identity before release. |
| Forecast deployment — BLOCKED qualification | Real trained test artifact proved the export path; it is not a production model approval. | Ready, compatible, approved actual model and tenant data in deployment. | No dummy fallback; validate version/quality, readiness and timeout/unavailable states. |
| Physical label hardware — BLOCKED qualification | Browser label flow tested; no physical scanner or printer used. | Representative USB/camera devices, A4/thermal media, browser settings. | Actual barcode round trip, dimensions, quiet zones and print scale; no stock writes while testing association/reprint. |
| Background/streamed huge exports — PARTIAL | Current system deliberately buffers bounded files; no durable report-generation queue. | Demonstrated need beyond budgets, existing job/storage pattern and cleanup policy. | Query consistency, secure expiring file access, cancellation, limits and load qualification before adding jobs. |

## Dependency-ordered follow-up

1. Release the verified existing report contracts with configured business access and browser downloads; no export schema migration is required.
2. Qualify the actual deployment PDF/native assets and authorized production model. Qualify printer/scanner output separately if labels are used operationally.
3. Resolve Admin financial parity only with an explicit policy decision and full server/client regression matrix.
4. Add historical valuation, payment events or commission reports only after their persisted domain contracts exist.
5. Extend fonts or queued exports when a measured business requirement justifies them, retaining tenant permissions, real calculations and content/visual checks.
