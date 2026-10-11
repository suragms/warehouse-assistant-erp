# All-pages responsive fix report

Date: 2026-10-11 (Asia/Calcutta). Repository inspected locally at `2a22223` with all existing working-tree changes preserved. This report supersedes the earlier five-size **geometry-only** claim for the specific table-readability defect. Earlier changes and their evidence remain in `FRONTEND_UI_VERIFICATION.md`.

## Inventory and counting

- **40 addressable route samples discovered and source-inspected**, including root index, two section redirects, public authentication and wildcard. The source contains 40 `path` registrations and one index registration; the protected root is a wrapper, so it is not counted twice.
- **34 route samples receive direct page/component fixes in this follow-up**; six inherit the shared fixes or already use appropriate layouts (`/`, `/inventory`, `/purchases`, `/inventory/:id/activity`, `/settings/help`, wildcard). A modified source component shared by create/edit or filtered list routes counts once for each real route; this is not a count of unrelated new pages.
- **19 production table sites in 15 files** inspected. Every table now has an intentional desktop/comparison minimum width and a named, focusable contained scroll region. Simple records have a single-render phone representation, preserving selection and actions.
- Final tested route count/status and the eight-size light/dark measurements are pending the current execution. `ALL_PAGES_RESPONSIVE_AUDIT.md` lists every route separately.

## Root causes and implementation

| Finding | Source evidence / change | Dependencies, security and regression evidence |
|---|---|---|
| R01 single-character columns | `theme/globals.css` applied `overflow-wrap:anywhere` to all `td/th`; `w-full`/`min-w-full` tables had no intrinsic width bounds. Before images reproduce vertical headings. Removed this blanket wrapping; headers in comparison regions stay on one line and tables retain explicit widths. | Uses existing Tailwind palette and browser scrolling; no global `break-all` or overflow hiding. Browser tests assert actual table ancestors, header styles and page/main geometry. |
| R02 simple business lists | `StockList`, `PurchaseList`, `CatalogList`, `CategoryList`, `TypeList`, `SupplierList`, `BrokerList`, `UsersPage` now use `ResponsiveRecords`, `RecordCard`, `RecordFields`; the same action functions and data feed phone and desktop views. | Existing row navigation, granular permissions, mutation handlers, filters, paging, label selection, purchase select-all and real CSV formatter retained. Unit/browser tests assert fields/actions, restricted roles and selection. |
| R03 order details and recent records | `PurchaseDetail` uses one receipt-control renderer in phone cards and desktop rows. `PurchaseDashboard` and `Dashboard` recent purchases/activity use record cards; identifiers, names, statuses, quantities, totals and actions stay available. | Loaded versions, explicit receipt input, Max/Fill All, server preview/commit and stock calculations retained. Tests use Verified orders for receipt controls; dispatched orders must not expose them. No visual change bypasses lifecycle rules. |
| R04 comparison tables | `ReportsDashboard` spend; `MlPage` forecast/outcomes; `OperationsPage` movement/snapshots; `HistoricalConsumptionImport` preview keep comparison columns in `DataTableScroll`. ML daily history and operation snapshots use phone records where comparison is unnecessary. | Real API calculations/model availability unchanged. Ready model/monitoring fixture data exists only in tests. Import preview tests never commit historical records; provider output and real production model operation are not claimed verified. |
| R05 narrow controls and content | Catalog/purchase/stock actions, filters and pagination wrap; purchase form fields group coherently; barcode lookup and assignment candidates stack; supplier mappings/history and user credentials wrap. Catalog save toolbar is static on phones to avoid bottom navigation/keyboard overlap. | Form values, validation, original optimistic-concurrency versions, mutations and invalidation are preserved. Existing component tests plus populated browser cases and shared dialog checks cover contracts. |
| R06 nested settings/export/recovery | Export download labels and forecast paging wrap; backup schedules/fieldsets and checksum text fit narrow screens; account password, AI routing and OCR/voice controls retain widths; notifications use stacked record metadata/actions. | Existing server role checks, secret masking, consent, busy guards and explicit recovery confirmation unchanged. SuperAdmin tests use mocked schedules/jobs/preflight; no real restore, key, archive or external send. |
| R07 public auth and shell | Public auth controls receive 44px phone targets and 16px input text; login uses a primary heading and API error alert. Long desktop header account names truncate with a full title. Existing safe-area/dvh/bottom-nav padding, More drawer and theme continue to work. | AuthProvider cache clearing/remount, API refresh interceptor, Zustand state and route guards are unchanged. `useMobileViewport` has a resize fallback where matchMedia is absent; unit checks cover single layout and selection across a breakpoint. |
| R09 selection and browser history | `PurchaseList` clears selection and stale copy feedback on page/filter changes and guards refreshed empty selections. `Dashboard` stops nested link propagation so a link and its clickable row do not push the same destination twice. | Seven purchase unit cases cover every filter, both page directions, removed records and delayed clipboard success/failure; two router-history unit cases cover link and row navigation. New Edge regressions exercise pointer/Enter/Back and page/search selection at 320 and 1366px. |
| R08 truthful unavailable data | Operations checklist/team progress no longer substitutes zero when corresponding query data is unavailable. Existing independent retry/error states across stock, purchase, reports and notifications remain. | Does not change aggregates or backend calculations. Existing query-error/role/cache tests remain part of the full suite. |

## Changed source inventory

Production paths below are relative to `frontend/src/`; these are the responsive follow-up edits, rather than an attribution of every pre-existing dirty file to this task.

| Area | Files changed in this follow-up |
|---|---|
| Shared layout | `components/ui/ResponsiveRecords.tsx`, `layouts/useMobileViewport.ts`, `layouts/AppShell.tsx`, `theme/globals.css` |
| Public auth | `pages/auth/Login.tsx`, `pages/auth/PasswordRecovery.tsx` |
| Catalog | `pages/catalog/CatalogList.tsx`, `CategoryList.tsx`, `TypeList.tsx`, `CatalogForm.tsx`, `CatalogDetail.tsx`, `BarcodeManager.tsx`, `DuplicateReview.tsx` |
| Partners/users | `pages/suppliers/SupplierList.tsx`, `pages/brokers/BrokerList.tsx`, `pages/users/UsersPage.tsx`, `pages/PartnerDetail.tsx`, `components/SupplierHistory.tsx` |
| Inventory | `pages/stock/StockList.tsx`, `StockDashboard.tsx`, `StockDetail.tsx` |
| Purchases | `pages/purchases/PurchaseList.tsx`, `PurchaseDashboard.tsx`, `PurchaseDetail.tsx`, `PurchaseForm.tsx` |
| Summaries/operations | `pages/Dashboard.tsx`, `pages/reports/ReportsDashboard.tsx`, `pages/MlPage.tsx`, `pages/OperationsPage.tsx`, `pages/NotificationsPage.tsx`, `pages/AuditPage.tsx`, `components/HistoricalConsumptionImport.tsx` |
| Settings/exports/recovery | `pages/SettingsPage.tsx`, `pages/BackupPage.tsx`, `components/ExportCenter.tsx`, `ServerDownload.tsx`, `DatabaseBackupPanel.tsx`, `AccountSecurity.tsx`, `AiProviderSettings.tsx`, `AI/MediaTextInput.tsx`, `WhatsAppDelivery.tsx` |

New unit files: `frontend/src/tests/{ResponsiveRecordLayout,StockPurchaseResponsiveRecords,BusinessRecordsResponsive,DashboardResponsiveRecords}.test.tsx`. Browser additions/updates: `frontend/e2e/all-pages-fixture.ts`, `all-pages-responsive-workflows.spec.ts`, `responsive-routes.spec.ts`, `ui-audit-workflows.spec.ts`, `database-backups.spec.ts`, `purchase-navigation-regressions.spec.ts`. The current route tree is retained; there is no new fake page, dependency or backend change in this follow-up.

## Every table/data representation

| Component / actual source | Phone | Desktop/comparison minimum |
|---|---|---|
| `pages/stock/StockList.tsx` | Name/SKU/barcode/category; system, physical, reserved, available/reorder quantities and unit; severity; View | 60rem |
| `pages/purchases/PurchaseList.tsx` | Order/supplier/status/delivery/amount/date/actions; selection and select-all | 64rem |
| `pages/purchases/PurchaseDetail.tsx` | Item/SKU/ordered/received/unit price/line total and permission-gated explicit receipt controls | 48rem or 64rem with receipt controls |
| `pages/purchases/PurchaseDashboard.tsx` | Recent order metadata and Inspect | 52rem |
| `pages/Dashboard.tsx` (two sites) | Recent order and stock activity cards | 32rem each |
| `pages/catalog/CatalogList.tsx` | Name/SKU/category/type/stock/unit/barcode/status; label selection/view/edit | 64rem |
| `pages/catalog/CategoryList.tsx`, `TypeList.tsx` | Compact labeled records and identical action controls | 30rem / 36rem |
| `pages/suppliers/SupplierList.tsx`, `brokers/BrokerList.tsx` | Partner name/contact or linked count/status and existing actions | 48rem / 36rem |
| `pages/users/UsersPage.tsx` | Name/email/role/status/date and existing user/credential/permission actions | 56rem |
| `pages/reports/ReportsDashboard.tsx` | Essential spend comparison scrolls; supplier/category summaries stack | 28rem |
| `pages/MlPage.tsx` (three sites) | Forecast/outcomes comparison scrolls; confirmed daily history uses cards | 34rem / 44rem / 24rem |
| `pages/OperationsPage.tsx` (two sites) | Snapshots use cards; movement comparison scrolls | 42rem / 46rem |
| `components/HistoricalConsumptionImport.tsx` | Validated preview comparison scrolls with intact literal identifiers | 40rem |

Supplier history, audit, notifications, duplicates, variants, damage records, backup jobs and operations tasks already use lists/cards rather than table markup; their actual controls and narrow states were inspected. No interactive chart canvas is currently rendered by the registered pages: reports/forecast use the tables, metric cards and lists above. An installed chart package alone is not evidence of an active chart. No chart or production metric was fabricated.

## Nested workflow checklist

| Module | Actual source/workflows inspected | Browser/functional evidence scope |
|---|---|---|
| Auth/shell | Login; forgot/reset fragment-token flow; profile/password/logout-all; desktop nav; More groups/business selection/logout/search; breadcrumb/skip link; direct loads/back/forward/theme | Existing branding/navigation/realtime/recovery suites; route matrix/public forms; long name/safe area/constrained viewport checks |
| Catalog/barcodes | Catalog create/edit/archive/conflict; category/type CRUD; duplicate threshold/archive; variant CRUD; barcode assign/generate/search/Enter/camera fallback/single+batch print | Existing barcode/variant/form tests; mobile field/selection/permissions tests; populated lookup and dialog matrix. Physical camera/wedge/printer unverified |
| Inventory | Overview/all/low/out/detail/history; filters/paging/export; system/physical/reserved/available values; adjust/count/reconcile with reasons and versions | Stock unit contracts and populated cards; phase3/browser flows. Mock writes only in explicit existing workflow tests; no live stock write |
| Purchases | New/edit/AI suggestions/server preview; supplier price hints; line charges/totals; confirmation/dispatch/arrival/verification/receipt/completion/cancellation; payment/damage/activity/PDF/WhatsApp | Existing intent/phase3/completion/media/notification suites plus new versioned confirmation/receipt/CSV selection tests. No real provider delivery |
| Partners | Supplier/broker CRUD/images/details; supplier item mapping/preferred/unlink/history/filter/page/CSV | New mobile business-list tests; existing guarded contact/navigation tests; dialog matrix |
| Reports/ML | Period/grouping/three report tabs; individual export center/history; item/horizon/model status/reorder/history/anomalies/outcomes; trusted historic CSV review/commit controls | Populated report/forecast/outcome/preview layouts plus existing export/ML/historical suites. UI fixture model output is not a trained-production-model claim |
| Operations | Checklist notes/completion; template add/remove/slot/save/cancel; assignments/status/accept/reject/complete/corrections/performance; daily usage/save/cancel; snapshots/materialize/movement/supplier frequency | Existing operations/settings suites plus populated snapshot/movement matrix; rules and APIs unchanged |
| Management/settings | User role/membership block/delete; create/edit/temporary credentials/permission switches/copy/share; personal/business/logo/preferences/masked provider credentials; AI routing; account sessions; historical fixture preview | Existing Users/PermissionEditor/cache/settings tests; all-size account dialogs; contract-only provider/credential checks |
| Backup/recovery | Export Center filters/formats/history; business browser/server extracts; history; JSON validation; SuperAdmin health/create/schedules/jobs/download/verify/protect/delete/preflight | Eight-size SuperAdmin schedule/confirmation checks and existing backup unit/download tests. Real backup/restore and durability are deployment qualification |
| Notifications/audit/help | Unread/all/read/all-read/reference nav; audit UTC/type/user/page/metadata/export; bilingual role-aware help accordion links | Existing failure/retry/notification/navigation suites and matrix. Server authorization remains authoritative |

Registration, standalone roles, standalone integrations and separate restore pages are **not registered**; actual membership/role workflows are in Users and integration/recovery sections are nested in Settings/Backup/purchase pages. The wildcard and public reset missing-link state show real explanatory content.

## Tests and artifacts

- Full unit/component/API run: **216 passed in 29 files**, `npm test -- --maxWorkers=2 --reporter=dot`. Includes 24 new regressions in four files: `ResponsiveRecordLayout`, `StockPurchaseResponsiveRecords`, `BusinessRecordsResponsive`, `DashboardResponsiveRecords`. Existing auth-cache undefined mock and CSV act warnings are emitted; no pass is claimed for earlier failed attempts.
- Lint: **PASS**, `npm run lint` (Oxlint).
- Production build: rebuilt before browser runs; initial TypeScript test-selector error was corrected before execution. Final explicit outcome will be recorded after tests finish.
- Full expanded browser run: **286 passed in 11.1 minutes**, `npx playwright test --workers=2 --fully-parallel --reporter=line`. This run preceded the final two review fixes; their rebuilt 45-test route/dialog/populated/navigation regression run is pending. The earlier focused populated-state run passed **8/8** at all required sizes. The initial new populated test used Dispatched data for Verified-only receipt input; this fixture mismatch was corrected without changing lifecycle rules. Interrupted/failed runs are not passing evidence.
- Verified first full matrix: **640 route/theme/viewport measurements**, all 40 samples in each of 16 files. No document/main overflow, unnamed visible main form fields, uncaught page error, uncontained visible table or wrapping comparison heading was recorded. Final rebuild repeats the matrix after the review fixes.
- New viewport coverage: 320×700, 360×800, 390×844, 427×952, 768×1024, 1024×768, 1366×768, 1920×1080. Each registered route has light/dark cases; 16 dialogs run at each size; SuperAdmin backup controls run at each size. Exact final counts/status follow measured artifacts.
- Fresh before screenshots: `TestResults/responsive-ui/all-pages-before/` (Inventory and Purchases at 320/360/427px from the earlier production assets). Final route screenshots/JSON: `all-pages-after/`. Populated records/branches: `all-pages-populated/`; dialogs: `all-pages-workflows/`. These are ignored local QA files, not app data. Earlier before/after artifacts remain.

## Remaining qualification and blockers

Final route classification is limited to source and executed browser fixture checks. Live backend/database interoperability, actual deployed tenant/role configuration, every historic or extreme-volume dataset, screen readers, actual Android/iOS keyboard/safe areas, Safari/Firefox and physical scanner/camera/printer remain **UNVERIFIED**. External AI/OCR/voice/WhatsApp accounts and real storage/recovery are configuration/hardware qualification; tests do not send a message, restore a database or assert hardware operation. No production tenant ID, migration, stock calculation, lifecycle rule or server authorization was changed.

This is a browser/PWA application. There is no registered Electron/Tauri shell or native save dialog. Downloads and printing retain existing browser behavior. No page is filled with fake business values to conceal missing data, and unsupported feature routes are not invented.
