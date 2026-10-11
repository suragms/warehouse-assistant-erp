# Frontend Route Map

## Latest all-pages route evidence (2026-10-11)

[ALL_PAGES_RESPONSIVE_AUDIT.md](ALL_PAGES_RESPONSIVE_AUDIT.md) lists every registered pattern, actual source, guard, implemented correction and final status. There are **40 addressable route samples**, including redirects/public auth/wildcard. The current matrix uses **320/360/390/427/768/1024/1366/1920px** with their requested heights in both themes, and separately exercises nested dialogs/populated branches. The older five-size inventory below is historical.

## Current route inventory (2026-10-11)

See [FRONTEND_UI_VERIFICATION.md](FRONTEND_UI_VERIFICATION.md) for the full accessible-page, dialog and workflow checklist with source paths, permissions and verification limits. `router/index.tsx` now also registers guarded `/suppliers/:id` and `/brokers/:id` detail pages using the existing catalog APIs, repairing links from search and catalog details. There is no standalone roles route: role and permission workflows remain inside Users. Export Center/database recovery remain within `/settings/backup`.

`frontend/e2e/responsive-routes.spec.ts` contains one sample for every registered URL pattern, including redirects, authentication and not-found. It records geometry/content/errors/screenshots at all five requested viewports in light and dark themes. The earlier route overview below is retained as historical context.


Root architecture utilizing React Router v7 (or v6 Data API).

## Public Routes
* `/login` - Authentication, forgot password logic.

## Protected Routes (require Auth setup)
Wrapped by `<AuthGuard>` and `<AppShell>` (Sidebar, Header, Layout).

### Dashboard
* `/dashboard` - Main KPI tracking

### Purchases
* `/purchases` - List view with tabs (Active, History, Drafts)
* `/purchases/new` - Purchase Wizard
* `/purchases/:id` - Read-only details / lifecycle manager
* `/purchases/:id/edit` - Modify drafts
* `/purchases/:id/delivery` - Manage logistics transition
* `/purchases/:id/verify` - Staff verification sheet
* `/purchases/:id/payment` - Payment management modal/page

### Inventory
* `/inventory/stock` - Master stock virtualized table
* `/inventory/low-stock`
* `/inventory/physical` - Physical count adjustment UI
* `/inventory/system` - System adjustment UI
* `/inventory/audits` - Immutable audit log
* `/inventory/items/:id/activity` - Timeline view

### Catalog
* `/catalog/items`
* `/catalog/items/new`
* `/catalog/categories`
* `/catalog/types`
* `/catalog/variants`
* `/catalog/duplicates` - Fuzzy AI duplicate dashboard

### Contacts
* `/suppliers`
* `/suppliers/:id`
* `/brokers`
* `/brokers/:id`

### Reports
* `/reports/summary`
* `/reports/items`
* `/reports/suppliers`
* `/reports/categories`
* `/reports/profit`
* `/reports/movement`
* `/reports/activity` (Chronological feed)

### Operations
* `/operations/checklist`
* `/operations/usage`
* `/operations/snapshots`

### Settings & Staff
* `/staff/users` - Roster management
* `/staff/users/:id`
* `/staff/tasks`
* `/staff/activity`
* `/notifications`
* `/settings/profile`
* `/settings/business`
* `/settings/providers` (AI Keys)

## UX Modals / Drawers
- Global Search (Command + K)
- Notification Center Side Panel
- Quick Barcode Scan Modal