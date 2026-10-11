# All-pages responsive audit

Date: 2026-10-11. Working-tree baseline: existing user changes preserved. This follow-up responds to the observed vertically wrapped Inventory and Purchase Orders columns. The previous five-viewport geometry suite did not test column readability; its historical PASS does not imply this request was satisfied.

## Inventory and verification scope

The router has 40 addressable samples/patterns (including the index, redirect aliases and wildcard), from 40 path registrations plus one index registration; the protected root is a structural wrapper, not an extra page. Source audit covers every registered component and nested workflow. Browser verification must use 320×700, 360×800, 390×844, 427×952, 768×1024, 1024×768, 1366×768 and 1920×1080. Statuses below are pending final browser execution, not inferred from shared CSS.

## Observed root causes and changes in progress

- `theme/globals.css` applied `overflow-wrap:anywhere` to all table cells. With no table minimum width, it permitted single-character headers/values while avoiding document overflow. Captured before images reproduce the defect at 320px. Remove that blanket rule and constrain table layout intentionally.
- Simple business-record tables need single-render mobile cards preserving labels, values, permissions, selection and handlers. Desktop tables retain their columns and contained scrolling.
- Financial/forecast/movement comparison tables need explicit minimum widths and keyboard-focusable named scroll regions.
- Nested forms, dialogs, lists, settings, actions and dashboards require separate populated-state checks; a route landing screenshot cannot certify hidden branches.

## Every registered route

| Registered pattern | Rendered sample | Primary source (under `frontend/src/pages/`) | Existing guard | Observed defect and implemented resolution | Verification evidence | Final status |
|---|---|---|---|---|---|---|
| `/` | `/` | `frontend/src/router/index.tsx` | Authenticated | Index redirect preserves replacement history and resolves Dashboard; shared shell/theme/navigation checks. | matrix; navigation | UNVERIFIED |
| `/dashboard` | `/dashboard` | `Dashboard.tsx` | Authenticated / page-specific | Recent purchase/activity tables collapsed on phones; now labeled cards, bounded desktop tables and wrapping KPIs/actions. Purchase link history is tested. | matrix; populated workflows; Dashboard unit; navigation | UNVERIFIED |
| `/catalog/items` | `/catalog/items` | `catalog/CatalogList.tsx` | catalog.view | Compressed catalog columns; phone metadata cards and 64rem desktop table preserve selection, labels and guarded actions. | matrix; populated workflows; business-record unit; barcode | UNVERIFIED |
| `/catalog/items/new` | `/catalog/items/new` | `catalog/CatalogForm.tsx` | catalog.create | Narrow form/action widths and sticky save bar; controls wrap and phone save bar is static above fixed navigation. | matrix; catalog form unit; barcode | UNVERIFIED |
| `/catalog/items/:id` | `/catalog/items/c1` | `catalog/CatalogDetail.tsx` | catalog.view | Long metadata/stock values and barcode candidates need room; wrapping detail sections preserve assignment, variants and archive gates. | matrix; barcode; variant; frontend regressions | UNVERIFIED |
| `/catalog/items/:id/edit` | `/catalog/items/c1/edit` | `catalog/CatalogForm.tsx` | catalog.edit | Same form correction as create; loaded version and unsaved-edit preservation remain unchanged. | matrix; catalog form and edit regressions | UNVERIFIED |
| `/catalog/categories` | `/catalog/categories` | `catalog/CategoryList.tsx` | catalog.view | Compressed simple table; phone cards and 30rem comparison table share guarded CRUD actions. | matrix; eight-size dialog checks; business-record unit | UNVERIFIED |
| `/catalog/types` | `/catalog/types` | `catalog/TypeList.tsx` | catalog.view | Compressed simple table; phone cards and 36rem comparison table preserve category filter and CRUD. | matrix; eight-size dialog checks; business-record unit | UNVERIFIED |
| `/catalog/barcodes` | `/catalog/barcodes` | `catalog/BarcodeManager.tsx` | catalog.view | Search/print toolbar and long lookup values crowd phones; stacked controls, names and candidates retain Enter/camera fallback/label behavior. | matrix; populated lookup; barcode unit/browser | UNVERIFIED |
| `/catalog/duplicates` | `/catalog/duplicates` | `catalog/DuplicateReview.tsx` | catalog.edit | Long candidate/action flex children overflow; shrinkable wrapping records retain latest-version explicit archival. | matrix; duplicate archive unit | UNVERIFIED |
| `/suppliers` | `/suppliers` | `suppliers/SupplierList.tsx` | supplier.view | Compressed records, mapping/history controls; phone cards, 48rem table and wrapped mapping/history retain every action. | matrix; populated workflows; eight-size dialogs; business-record unit | UNVERIFIED |
| `/suppliers/:id` | `/suppliers/s1` | `PartnerDetail.tsx` | supplier.view | Long names/contact metadata need wrapping; actual guarded API-backed detail inspected. | matrix; global-search detail navigation | UNVERIFIED |
| `/brokers` | `/brokers` | `brokers/BrokerList.tsx` | broker.view | Compressed simple table; phone cards and 36rem table retain linked count, active state and CRUD. | matrix; populated workflows; eight-size dialogs; business-record unit | UNVERIFIED |
| `/brokers/:id` | `/brokers/b2` | `PartnerDetail.tsx` | broker.view | Long broker name/metadata needs wrapping; actual guarded detail inspected without invented fields. | matrix; contact/navigation regressions | UNVERIFIED |
| `/inventory` | `/inventory` | `frontend/src/router/index.tsx` | Authenticated / page-specific | Existing alias resolves overview; replacement redirect and destination verified, no page-specific rewrite. | matrix; navigation | UNVERIFIED |
| `/inventory/overview` | `/inventory/overview` | `stock/StockDashboard.tsx` | stock.view | Long KPIs/alerts/actions could squeeze; wrapping values, names and alert controls preserve independent query states. | matrix; stock failures; navigation | UNVERIFIED |
| `/inventory/all` | `/inventory/all` | `stock/StockList.tsx` | stock.view | Reproduced vertical headers/values; phone cards expose every stock quantity/unit and View, desktop comparison stays 60rem. | matrix; populated workflows; stock-record unit; CSV | UNVERIFIED |
| `/inventory/low-stock` | `/inventory/low-stock` | `stock/StockList.tsx` | stock.view | Same StockList defect/fix with existing low-stock API and severity/filter behavior retained. | matrix; populated workflows; stock-record unit | UNVERIFIED |
| `/inventory/out-of-stock` | `/inventory/out-of-stock` | `stock/StockList.tsx` | stock.view | Same StockList defect/fix with existing out-of-stock API retained; no stock mutation from presentation. | matrix; populated workflows; stock-record unit | UNVERIFIED |
| `/inventory/:id` | `/inventory/c1` | `stock/StockDetail.tsx` | stock.view | Narrow stock-value/action groups; wrapping cards/buttons and responsive padding preserve adjustment/count/reconcile contracts. | matrix; stock unit; phase3 workflows | UNVERIFIED |
| `/inventory/:id/activity` | `/inventory/c1/activity` | `stock/StockActivity.tsx` | stock.view | Existing movement cards already fit; inspected page/unit/history independent errors and real pagination, shared controls retained. | matrix; history paging unit; phase3 | UNVERIFIED |
| `/purchases` | `/purchases` | `frontend/src/router/index.tsx` | Authenticated / page-specific | Existing alias resolves overview; replacement redirect and destination verified. | matrix; navigation | UNVERIFIED |
| `/purchases/overview` | `/purchases/overview` | `purchases/PurchaseDashboard.tsx` | purchase.view | Recent PO table compressed; phone records with Inspect and 52rem table, wrapping KPI/actions retain authoritative aggregates. | matrix; populated workflows; aggregate/redaction unit | UNVERIFIED |
| `/purchases/list` | `/purchases/list` | `purchases/PurchaseList.tsx` | purchase.view | Reproduced vertical PO columns; phone selection/action cards and 64rem table. Selection clears on query/page change and cannot copy empty refreshed rows. | matrix; populated workflows; purchase-record unit; CSV; navigation regressions | UNVERIFIED |
| `/purchases/new` | `/purchases/new` | `purchases/PurchaseForm.tsx` | purchase.create | Dense item fields/charges/totals/actions need grouping; coherent desktop row and single-column phone fields preserve preview/save rules. | matrix; phase3 AI/form/error/payment workflows; edit unit | UNVERIFIED |
| `/purchases/:id` | `/purchases/p1` | `purchases/PurchaseDetail.tsx` | purchase.view | Receipt/item columns squeezed; single control renderer supplies phone cards or 48/64rem table, lifecycle actions wrap; activity errors can retry. | matrix; populated Verified receipt; explicit receipt unit; phase3 | UNVERIFIED |
| `/purchases/:id/edit` | `/purchases/p1/edit` | `purchases/PurchaseForm.tsx` | purchase.edit | Same form layout fix as create; original version, price hints, reviewed suggestions and server preview remain. | matrix; edit-preservation unit; phase3 | UNVERIFIED |
| `/reports` | `/reports` | `reports/ReportsDashboard.tsx` | reports.view | Spend comparison lacked width floor and summaries squeezed; 28rem scroll region and stacked summaries/metrics preserve server totals. | matrix; populated three tabs; failed query/keyboard tabs; export | UNVERIFIED |
| `/ml` | `/ml` | `MlPage.tsx` | stock.view | Forecast/outcome/history columns lacked width bounds; 34/44rem comparison regions and daily phone records preserve ready/unavailable model states. | matrix; populated outcomes/import; ML unit; historical/completion | UNVERIFIED |
| `/audit` | `/audit` | `AuditPage.tsx` | Authenticated; Owner/SuperAdmin in page | Filter/pagination rows need wrapping; existing UTC history cards and explicit role restriction retained. | matrix; audit role/retry/export workflows | UNVERIFIED |
| `/notifications` | `/notifications` | `NotificationsPage.tsx` | Authenticated / page-specific | Inline title/message/type/action row squeezed; stacked records and wrapping filters/page controls retain read/reference/error handling. | matrix; notification completion/failure; navigation | UNVERIFIED |
| `/operations` | `/operations` | `OperationsPage.tsx` | Authenticated / page-specific | Usage/template grids, snapshot and movement columns squeeze; earlier stacked grids, snapshot cards, bounded 42/46rem tables and truthful unavailable counts. | matrix; populated snapshots; operations CRUD/failure suites | UNVERIFIED |
| `/settings` | `/settings` | `SettingsPage.tsx` | Authenticated / page-specific | Long fields/credential labels and nested account/AI controls need wrapping; preserve masking, consent, edits and session/business guards. | matrix; populated account/AI; operations-settings/media/cache suites | UNVERIFIED |
| `/settings/backup` | `/settings/backup` | `BackupPage.tsx` | reports.view | Long report/job/checksum actions need wrapping; constrained export/backup/schedule/recovery controls preserve role and confirmation gates. | matrix; eight-size SuperAdmin recovery; export/backup unit/browser | UNVERIFIED |
| `/settings/help` | `/settings/help` | `HelpGuidePage.tsx` | Authenticated / page-specific | Existing bilingual accordion/link layout already usable; source and permission-sensitive destinations inspected, shared controls retained. | matrix; bilingual help role cases | UNVERIFIED |
| `/users` | `/users` | `users/UsersPage.tsx` | users.view | Compressed user table and credentials/actions; phone cards, 56rem table and wrapped credentials retain permission/role/share logic. | matrix; populated workflows; eight-size dialogs; Users/PermissionEditor unit | UNVERIFIED |
| `*` | `/missing-page` | `frontend/src/router/index.tsx` | Authenticated / page-specific | Existing fallback contains explanatory heading and Dashboard link; shared shell tested, no blank placeholder route. | matrix; navigation | UNVERIFIED |
| `/login` | `/login` | `auth/Login.tsx` | Public | Public inputs lacked phone target sizing; 44px controls, 16px text, primary heading and alert fit narrow/short screens. | matrix; login/error/logout/keyboard suites | UNVERIFIED |
| `/forgot-password` | `/forgot-password` | `auth/PasswordRecovery.tsx` | Public | Public recovery field/action sizing follows auth fix; existing anti-enumeration response and fragment-token flow retained. | matrix; recovery-media | UNVERIFIED |
| `/reset-password` | `/reset-password?token=fixture&email=colleague%40example.test` | `auth/PasswordRecovery.tsx` | Public | Same public layout fix; matrix exercises legacy query-token rejection explanation, recovery suite tests supported fragment-token reset. | matrix; recovery-media | UNVERIFIED |

## Nested workflow inventory

Detailed source inventory, implemented changes and executed browser evidence are being assembled in `ALL_PAGES_RESPONSIVE_FIX_REPORT.md`. Existing auth guards/API interceptors/TanStack Query/Zustand state and backend business rules remain authoritative. No database migration, production stock mutation, restore or external delivery is performed in this audit.

## Evidence

- `TestResults/responsive-ui/all-pages-before/`: six fresh captures of Inventory/Purchases at 320, 360 and 427px from the pre-change production build; `baseline-tables.png` shows vertical column wrapping.
- Earlier route and dialog screenshots remain in `TestResults/responsive-ui/before`, `after` and `workflows`.
- Final matrix, readability assertions and populated workflow tests will be recorded after execution. No current final PASS is claimed.
