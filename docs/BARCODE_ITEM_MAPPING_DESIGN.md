# Barcode-to-item mapping: implemented design and verification

Implementation date: 2026-10-10. Repository baseline: `80ba7e9cd4f1cefa79b26417e568a26bf2a9b3c1`. This change reuses the existing catalog entity, tenant scope, authorization policies, audit pipeline and browser barcode tools. The other feature audits remain historical audit deliverables.

## Current implementation and classification

| Requirement | Classification | Implementation / evidence |
|---|---|---|
| Tenant-scoped association, reassignment and clear | VERIFIED COMPLETE | `CatalogService.AssignBarcodeAsync`, `BarcodeAssignmentDto`, controller PATCH; optimistic Guid version and explicit JSON barcode presence; existing PostgreSQL unique index is the race-safe constraint. |
| Exact lookup, leading zeroes, duplicate rejection | VERIFIED COMPLETE | Indexed equality replaces lowercased matching; explicit BusinessId predicate plus global tenant filter; `ABC` and `abc` are distinct identifiers, `00123` differs from `123`. PostgreSQL tests exercise these rules. |
| Create/edit barcode validation | VERIFIED COMPLETE | Create, full update and narrow PATCH share normalization, availability and validation; controls/overlength/unsupported new encodings fail before saving. |
| Internal barcode generation | VERIFIED COMPLETE | POST generation for an existing active item with no barcode, using `WA-` plus 32 uppercase hex UUID characters. No item/SKU is fabricated. Codes are Code 128 internal identifiers, not registered EAN/UPC/GS1 codes. The unique index prevents any persisted duplicate even under a race. |
| Authorization and inventory integrity | VERIFIED COMPLETE | Existing `RequireCatalogView`, `RequireCatalogCreate`, `RequireCatalogEdit`; current business comes from the authenticated server session. Audit captures old/new Barcode atomically. No stock engine call; no balance, movement or purchase-history writes. |
| Manual / keyboard-wedge lookup | VERIFIED COMPLETE in automated scope | Focused input plus Enter; lookup is read-only. Enter is stopped from propagating or submitting surrounding forms. Repeated scans refresh the current match; pending assignment has a synchronous guard. Physical USB hardware is unverified. |
| Individual and batch labels | VERIFIED COMPLETE for supported browser labels | Existing jsbarcode CODE128 encoder includes checksum, SVG bars and human-readable value; React-safe item names. Item detail/lookup reprint; catalog selection prints current-page eligible active items in separate flowing blocks. Print portal excludes application chrome and prevents overlapping batch labels. |
| Successful camera capture and lifecycle | PARTIAL | Existing native BarcodeDetector/getUserMedia implementation retained; secure-context feature detection, local-only frames and manual fallback. Automated success, late permission cancellation and denial verified. Real devices are unverified. |
| Physical scanner / printer read-back | BLOCKED | No physical scanner, camera device or printer was available for qualification. Browser emulation and print stubs do not prove hardware compatibility. |
| Multiple aliases / variant mapping | MISSING, outside this scope | One parent barcode remains supported. Existing unused variant fields are not exposed as a second barcode namespace. No additional entity or architecture change is introduced. |

## API and data rules

- `PATCH /api/v1/catalog/items/{id}/barcode`: `{ "barcode": "00123", "expectedVersion": "<loaded Guid>" }`. Explicit null clears; blank/whitespace normalizes to null. An omitted barcode property is rejected; a missing/empty version is rejected. Unchanged values do not create an audit event or new version.
- `POST /api/v1/catalog/items/{id}/barcode/generate`: `{ "expectedVersion": "<loaded Guid>" }`. Existing barcode or archived item returns a clear conflict, never an overwrite. A candidate is checked in the tenant; the unique index remains the final arbiter. A rare conflicting race returns a conflict and can be retried after reloading.
- `GET /api/v1/catalog/items/by-barcode?barcode=<URL-encoded text>`: safe for slash, query punctuation and leading zeroes. Existing `by-barcode/{barcode}` remains compatible for route-safe values. Unknown codes return 404 `BARCODE_NOT_FOUND`; invalid codes return 400 `INVALID_BARCODE`.
- Assignment trims outer whitespace, preserves case and leading zeroes, and accepts at most 100 printable ASCII characters for new values. Nonblank raw control characters are rejected, including a trailing newline. No truncation or numeric conversion occurs. Existing Unicode values can be looked up and retained unchanged in an edit; new Unicode mappings are rejected because the current printable symbology does not support them.
- Labels retain the existing 1–64 printable ASCII capability limit and validate with the actual CODE128 encoder. Values of 65–100 characters remain valid storage/lookup identifiers but show explicit unsupported-label feedback; no misleading label is emitted. Generated codes are always inside the printable limit. Specialized long-code or thermal-printer sizing remains a separate device-qualified profile.
- Archived codes remain reserved by the existing index. Lookup returns the archived item with `isActive=false` and the UI warns explicitly. No implicit reactivation or reservation release occurs. Clearing an archived mapping requires the same authorized, version-checked explicit action as any other clear.
- 409 codes distinguish `DUPLICATE_BARCODE`, `CATALOG_ITEM_VERSION_CONFLICT`, `CATALOG_ITEM_BARCODE_EXISTS` and `CATALOG_ITEM_INACTIVE`. Duplicate responses deliberately contain no conflicting item ID/name, including for edit-only callers. This avoids disclosing catalog records the caller cannot view. Only expected PostgreSQL unique constraints are translated; unrelated persistence errors retain the normal error handler.

## UI and cache behavior

`BarcodeAssignment.tsx` is shared by Barcode Manager and item detail. It offers save, explicit clear, generation when eligible and reload after conflict. Loading disables controls; success says stock is unchanged; validation/network errors preserve the draft. Item search offers accessible selection buttons, loading, empty and retry states. Lookup displays name, item code (SKU), barcode, unit and current stock and identifies archived results.

The existing CatalogForm still creates/edits the field using the same server rules; scanner Enter does not submit the catalog form. Its blank barcode payload is explicit null, and duplicate feedback targets the barcode field. Catalog list links to Barcode Manager and provides per-page batch selection. Printing performs no API mutation and does not create an item.

`invalidateBarcodeQueries` refreshes all barcode lookups (including both old and new codes), catalog lists/details, global search, stock reads and duplicate review after mapping changes. Catalog-form saves and archiving use the same invalidation. Existing authentication/tenant cache isolation is retained.

## Migration and deployment instructions

**No new migration or data rewrite is required.** Existing `CatalogItem.Barcode` is nullable varchar(100), and `IX_CatalogItems_BusinessId_Barcode` uniquely indexes `(BusinessId, Barcode)` where Barcode is not null. It includes archived items. There is no global barcode uniqueness rule to replace. `CatalogItem.RowVersion` is already a concurrency token. The entity/configuration/snapshot were unchanged.

The complete existing migration chain was applied only to a fresh, randomly named `wa_test_*` PostgreSQL 17 database on a loopback random port. The barcode integration suite asserts no pending migrations and no model/snapshot changes, then verifies the real unique index. The disposable runner now caches the Windows process handle before checking exit status, shuts down a possibly started cluster after setup errors, and preserves files if shutdown fails. Its listener cleanup also works in Windows PowerShell 5. No production database was migrated or changed.

For deployment, use the established release process and verify the existing index and current migration head in the approved staging environment first. Run the disposable rehearsal with:

```powershell
powershell -NoProfile -File scripts/run-postgres-integration-tests.ps1
```

If a legacy installation is missing the original constraint or contains noncanonical rows, stop deployment and produce an authorized, read-only tenant-scoped collision report before any DDL. Example staging checks:

```sql
-- Exact duplicates, including archived reservations:
SELECT "BusinessId", "Barcode", count(*)
FROM "CatalogItems" WHERE "Barcode" IS NOT NULL
GROUP BY "BusinessId", "Barcode" HAVING count(*) > 1;

-- Space-trimming collisions (also review Unicode whitespace separately):
SELECT "BusinessId", btrim("Barcode") AS normalized, count(*)
FROM "CatalogItems" WHERE "Barcode" IS NOT NULL
GROUP BY "BusinessId", btrim("Barcode") HAVING count(*) > 1;
```

Review each collision with the authorized owner using original item IDs/history; do not merge items, invent identifiers, auto-clear mappings or modify balances. Resolve through explicit audited actions after verification. If constraint repair is actually needed for such an installation, prepare a separate reviewed additive migration only after the collision report is empty, retaining the old schema for reversible rollout. No such migration was added or executed here.

Application rollback requires no schema rollback and must preserve newly assigned values. Do not redeploy the old case-insensitive lookup without reviewing case variants, because that reintroduces ambiguous resolution.

## Executed verification

| Check | Actual result / evidence |
|---|---|
| Backend full unit/HTTP suite | 539 passed, 0 failed, 0 skipped; `dotnet test ...UnitTests.csproj --configuration Release --no-restore`; `TestResults/barcode-implementation/barcode-unit.trx`. |
| Real PostgreSQL suite and migration rehearsal | 74 passed, 0 failed, 0 skipped; disposable PostgreSQL 17 runner; `TestResults/barcode-postgres.log`. Includes five new database barcode cases. |
| Frontend full suite | 145 passed in 18 files, 0 failed; `npm run test -- --maxWorkers=2`; `TestResults/barcode-frontend.log`. |
| Browser barcode workflows | 6 passed, headless Edge with mocked APIs, widths 390/768/1440; `npx playwright test barcode-tools.spec.ts --reporter=line`; `TestResults/barcode-browser.log`. Assignment and batch printing tested at 390/1440. |
| Backend Release build | Succeeded, 0 warnings/errors; Web project, `--no-restore`; `TestResults/barcode-backend-build.log`. |
| Frontend lint / production build | `npm run lint` passed without diagnostics; `npm run build` passed TypeScript and Vite production build. |
| Print visual inspection | Browser-generated mobile batch-label screenshot reviewed: readable names and values, separate labels, escaped name text, no application chrome. This is not a physical print or scan test. |

New test sources: `backend/PurchaseAssistant.UnitTests/Services/BarcodeServiceTests.cs`, `backend/PurchaseAssistant.UnitTests/AI/BarcodeEndpointTests.cs`, `backend/PurchaseAssistant.IntegrationTests/Stock/BarcodeIntegrationTests.cs`, `frontend/src/tests/BarcodeAssignment.test.tsx`, `frontend/src/tests/BarcodeTools.test.tsx`, `frontend/src/tests/CatalogBarcodeForm.test.tsx`, and updated `frontend/e2e/barcode-tools.spec.ts`.

Coverage includes unique/duplicate and archived assignment, blank/length/control/encoding validation, exact case, leading zeroes, foreign item and same-code cross-tenant behavior, authorization and business-context rejection, query-encoded lookup punctuation, reassignment/clear/unknown lookup, mandatory and concurrent versions, generated-code refusal to overwrite, audit old/new values, unchanged balances/ledger/purchase rows/orders, print capability/batch isolation, USB-style Enter isolation, cache invalidation and camera lifecycle. Canvas text measurement is stubbed in component tests; real Code 128 encoding remains exercised. Browser tests stub print and camera permission/availability.

An initial unconstrained frontend run had three timing failures while backend/database suites ran concurrently; the complete suite then passed with two workers without relaxing assertions/timeouts. Earlier setup/build failures were corrected before the recorded successful runs. Results certify the stated automated scope only.

## Remaining hardware qualification

On each supported scanner/device/browser, enable Code 128, print a generated and representative supplier label at the intended paper/thermal settings, scan it back, and assert byte-for-byte identity (including zeroes and case). Check long names, quiet zones, minimum module width, printer resolution/scaling, labels near the size limit, duplicate scans, unknown and archived codes, camera success/permission denial/route changes and an Enter-suffix USB scanner. Confirm scanning/reprinting leaves stock unchanged. Physical camera support varies by browser; unsupported browsers retain manual/USB entry. No physical scanner, printer or real camera was tested in this implementation.

---

## Original audit and proposed design (historical)

Baseline: 2026-10-10, commit `80ba7e9cd4f1cefa79b26417e568a26bf2a9b3c1`. The following appendix records the pre-implementation findings; the implementation contract and verification above supersede these historical classifications. Finding IDs and classifications match [ERP_FEATURE_AUDIT.md](ERP_FEATURE_AUDIT.md).

## Existing storage and flow

- `backend/PurchaseAssistant.Domain/Entities/CatalogItem.cs`: Guid item ID, BusinessId via TenantEntity, separate required ItemCode, nullable Barcode, balances and Guid RowVersion.
- `backend/PurchaseAssistant.Infrastructure/Data/Configurations/CatalogItemConfiguration.cs` and migration `20260928151841_InitialCreate.cs`: Barcode varchar(100), unique `(BusinessId, Barcode)` where Barcode IS NOT NULL. No `IsActive` condition, so archived items retain their identifier reservation. ItemCode has its own tenant-scoped unique index.
- `EntityNormalizationService.NormalizeBarcode`: trim only; blank becomes null. Codes remain strings, so leading zeroes are preserved. `CatalogService.GetByBarcodeAsync` lowercases both sides, unlike persistence. Lookup includes archived rows because tenant filter does not imply active filter.
- `CatalogController.cs`: catalog-view GET `by-barcode/{barcode}`, catalog-edit PUT `{id}`; no separate mapping endpoint. `frontend/src/api/catalogApi.ts` URL-encodes lookup value.
- `frontend/src/pages/catalog/BarcodeManager.tsx`: manual/USB input, camera lookup, search for existing item, generic update `{ ...selectedItem, barcode }`, new-code and catalog cache invalidation. Old barcode/search caches are not invalidated here. A stale version is shown as a barcode duplicate.
- `frontend/src/pages/catalog/CatalogForm.tsx`: barcode edit alongside master fields, client limit 100. Clearing via omitted property deserializes to null in current full-update contract.
- `frontend/src/components/BarcodeTools.tsx`: CODE128 SVG using jsbarcode, 1–64 printable ASCII print constraint, `window.print()`; feature-detected secure-context camera with local frames and manual fallback. This does not generate a server PDF or prove thermal-printer dimensions.
- `MasterDataRelations.cs`, `MasterDataRelationsConfiguration.cs`, migration `20260928153110_AddMasterDataEntities.cs`: variant Code/Barcode text fields exist. `CatalogService.CreateVariantAsync`/`UpdateVariantAsync` only save Name/KgPerUnit, and lookup never checks variants. Do not claim variant mapping works from DTO shape alone.

## Findings and changes

| ID / status | Actual defect or gap | Proposed change | Dependencies | Security implications | Required tests |
|---|---|---|---|---|---|
| B01 PARTIAL | Assignment resubmits other master fields through generic PUT; a dedicated mapping/unlink contract is absent. Existing code does not change balances. | Add narrow request `{ barcode: string or null, expectedVersion: Guid }` to existing ICatalogService/CatalogService, controller and client. Keep generic catalog edits compatible using the same validator. | B02/B03; reuse RowVersion/audit pipeline. No stock-engine changes. | Require selected Business and `catalog.edit`, load item with explicit tenant predicate; client-supplied tenant/stock/code fields unavailable. | Association only changes barcode/version/time/audit; balance, movements, purchase lines and historical IDs unchanged; forbidden/foreign item returns safe result. |
| B02 BROKEN | Case-insensitive lookup and case-sensitive unique storage disagree; `ABC`/`abc` can be distinct rows but both satisfy lookup. | Proposed canonical rule: trim only, ordinal/exact case-sensitive identity. Keep barcode as text; indexed equality lookup. Before any migration, inventory collisions using approved read-only staging data. | Product contract about case sensitivity. Match actual database collation; no automatic rewrite/backfill. | Never auto-merge items, reassign a code or discard historical identifiers. | `00123` versus `123`, `ABC` versus `abc`, whitespace, same code across two tenants, duplicate in same tenant, inactive rows. Verify actual PostgreSQL behavior. |
| B03 BROKEN | API DTO lacks storage-length validation; 128 scan vs 100 storage vs 64 print. All 409s become duplicate warning; broad DbUpdateException catch masks unrelated persistence failures. | Validate max 100 trimmed characters and reject control characters in association API; retain a separate printable capability predicate. Parse conflict codes and return targeted 400/409 errors. Catch PostgreSQL 23505 by expected constraint; concurrency separately. | B01/B02, shared error representation. | No truncation, unsafe control characters, leaked SQL detail or blind retry. Printable restriction must not retroactively invalidate existing stored codes. | 0/null/blank, 64/65/100/101, ASCII/control/Unicode policy, encoded slash/query characters, duplicate versus stale version, unrelated database error classification. |
| B04 VERIFIED COMPLETE, bounded | Existing manual lookup and print path works in browser tests. No bulk labels/physical read-back verification. | Keep jsbarcode/print CSS; expose eligible label action at item detail and optional batch labels only if required. Add physical-size profile after scanner qualification. | B03, supported printer profile. | React-safe text; no arbitrary SVG injection; role-aware item lookup. | Printed encode/decode round-trip, millimetre dimensions, page margins, printer scaling, archived flag, long item names. Current tests stub `window.print`. |
| B05 PARTIAL | Only native BarcodeDetector support; successful physical capture and format coverage not verified. | Keep feature detection and manual fallback; add successful camera and lifecycle coverage before considering another decoder. | Supported-browser/device matrix and HTTPS test environment. | Ask browser permission; release tracks after capture/stop/unmount/error; no upload of camera frames. | Delayed permission grant after stop, detector failure, first valid result, rapid start/stop, route change, unsupported browser. Physical Android/iOS tests remain required. |
| B06 PARTIAL/MISSING | One parent barcode; variant fields are not writable; no alias registry. | First document actual support. Multiple aliases/variant codes require an additive tenant-scoped mapping entity only if product explicitly needs them, not duplicate CatalogItems. | B01–B03 done; barcode namespace and parent/variant selection decided. | One code resolves to one permitted target per business; preserve historical parent IDs and stock model. | Alias collisions, variant-parent ambiguity, inactive aliases, cross-tenant FKs, migration rollback and legacy lookup compatibility. |

## Proposed association transaction

1. Authorize and derive BusinessId from the current server session, never request body.
2. Load the existing item by `(BusinessId, itemId)`; return not-found for foreign/missing ID. Show archived state explicitly; do not auto-reactivate it.
3. Require nonempty expected version. Normalize/validate barcode; null explicitly unlinks the current mapping. Reject duplicate owned by another item, with database uniqueness as the race-safe final arbiter.
4. On unchanged value, return current mapping/version without manufacturing a stock change. Otherwise set Barcode, UpdatedAt and new RowVersion only; save atomically with the existing audit mutation pipeline. Return a complete mapping response, not the current sparse catalog update response.
5. Translate stale/concurrent update to `CATALOG_ITEM_VERSION_CONFLICT`; duplicate barcode to a distinct conflict. The user reloads before retrying. Never overwrite automatically.
6. Invalidate old and new lookup, item/list/global search and relevant read-only stock display caches. Do not mutate balances to refresh the screen.

Tentative route: `PATCH /api/v1/catalog/items/{id}/barcode`. Clear operation uses explicit JSON null in the same contract. This fits existing layers and policies. Assigning a barcode is master data maintenance, not a receipt, reservation, physical count, reconciliation, historical import, or stock movement.

Archived codes remain reserved with the current index. If reuse is later required, use an explicit audited unlink/reassign flow with item identity review; do not release on archive silently. For case-insensitive policy instead, introduce a canonical indexed key with an approved collision report first; switching only lookup or only the unique index is insufficient.

## Acceptance and evidence

Existing tests found: `backend/PurchaseAssistant.UnitTests/Services/ReferenceAuditSafetyTests.cs` verifies catalog reference isolation; barcode browser tests in `frontend/e2e/barcode-tools.spec.ts` verify manual fallback, SVG generation/print isolation at 390/768/1440 and camera denial. No dedicated PostgreSQL barcode uniqueness/assignment concurrency suite found. Unit/endpoint checks using EF InMemory cannot prove PostgreSQL unique-index races or collation.

Done means real PostgreSQL assignment tests pass in a disposable target, balances/ledger/purchase/history comparisons are unchanged after association, role/tenant/override checks pass, browser stale/duplicate feedback is correct, and physical labels are separately qualified. No migration, barcode data rewrite or scanner qualification was performed in this audit.
