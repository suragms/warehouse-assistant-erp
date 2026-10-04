# Historical consumption and model promotion

## Source semantics

One Business is one logical warehouse. `DailyUsageLogs.UsedQty` is a complete cumulative daily usage label. Confirmed manual usage is eligible; scheduled snapshots are not. Purchases replenish stock; receipts, corrections, physical snapshots and damage are not substituted for consumption. Individual sales or movement exports need a reviewed transformation into complete daily totals before import. No automatic purchase-to-demand mapping is provided.

The new Owner/SuperAdmin workflow is at **Inventory predictions → Import historical consumption**. CSV reading is supported. Existing Excel support is export-only, so this phase does not claim an Excel import parser. Convert a reviewed workbook to this documented CSV contract before previewing.

```text
business_id,warehouse_id,item_id,date,quantity,unit,transaction_type,recorded_at
```

Both scope IDs must equal the selected Business UUID. Item ID must identify an active item in that scope. Unit must exactly equal its saved unit; there is no implicit unit conversion. Date is `yyyy-MM-dd`, a completed UTC day within the last 730 days. Quantity is 0–1,000,000,000, at most four decimals, without currency/grouping/exponent notation. Type is exactly `consumption_daily_total`. `recorded_at` is the **original source UTC timestamp**, on that same date (`yyyy-MM-ddTHH:mm:ssZ`, optional fractional seconds). Original recording provenance must be credible and explicitly attested by the owner. Importing cannot establish that a claimed timestamp or business measurement is truthful.

Do not invent timestamps, turn missing days into zeros, sum cumulative rows, relabel receipts or backdate the application's audit log. Late source corrections are conservatively ineligible for chronological evaluation. A data owner must resolve ambiguous source records before importing.

## Preview, commit and failure safety

- Limits: 2 MB UTF-8 CSV, 5,000 daily rows, 100 items per file. Strict quoted CSV parser; values are never evaluated as formulas, HTML or executable content.
- `POST /api/v1/ml/history/preview` takes `csv`, `source` and `confirmCompleteDailyTotals`. It validates syntax, scope, item, unit, date, source time, type and duplicate item/date totals. Existing confirmed usage or imported dates reject an overwrite. Returns row-numbered errors, total/valid counts, SHA-256, first 50 normalized rows and a confirmation proof only when every row is valid.
- Preview writes nothing. The protected proof binds file hash, source, Business, user and a 15-minute expiry. Changing file/source invalidates confirmation. Membership and permissions are checked again on commit.
- `POST /api/v1/ml/history/commit` resubmits the same content and proof. It revalidates inside a PostgreSQL serializable transaction and writes the immutable batch, all labels and an audit event together. A unique Business/file-hash index prevents reimport; a unique Business/item/date index prevents concurrent duplicate labels. Composite foreign keys prevent foreign-tenant item/batch links.
- Invalid or stale inputs write no rows. Database errors roll back the transaction. A lost client response is reported as an unconfirmed outcome; preview detects a completed import, so blindly resubmitting cannot duplicate it.
- `HistoricalUsageBatches` retains raw CSV, source description, hash, importing actor, real import time and row count. `HistoricalUsageRows` retains item/date/quantity/unit/original source time. Ordinary application updates/deletes are denied. Current stock, purchases and stock movements are never changed by this import. There is no automatic correction/overwrite path for accepted provenance.

Raw imports and model histories are private business data: apply the same restricted database/storage access and retention process as operational records. Full PostgreSQL backup includes both new tables. User-facing JSON/ZIP exports are scoped business archives, not a substitute for full database recovery.

## Reproducible dataset construction

Raw CSV → strict validation → exact unit/quantity normalization → one unique complete daily total per Business/item/date → merge with confirmed application totals → reject invalid/conflicting dates → contiguous daily history → lag/rolling/weekday features → chronological fit/validation/holdout.

The aggregation grain is the complete daily total; import never adds two totals for the same date. Identical application duplicates collapse; conflicting cross-source/application dates become unknown. History must end yesterday and contain 120–730 consecutive days. Gaps are not filled. Imported labels use their original `SourceRecordedAt`; `ImportedAt` remains today's separate audit fact. Unit changes exclude imported labels in the old unit. Extraction selects explicit tenant records in groups of 100 active items and bounds observations; it does not issue one query per item. Each series has a canonical date/quantity SHA-256 version.

The unchanged ML core fits lag 1/7/14, mean 7/28, weekday sine/cosine. Scaling uses the fitting window only. The last 60 days are split into 30 validation and 30 held-out days; forecasts are recursive without future actual inputs. Final refitting happens only after recording evaluation. See the original architecture for eligibility and serving safeguards.

```powershell
# Supply the authorized operational connection through the operator's secret environment; never as an argument.
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- extract BUSINESS_UUID new-dataset.json
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- train new-dataset.json new-candidates
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- compare new-candidates private-serving BUSINESS_UUID ITEM_UUID CURRENT_VERSION
```

Training refuses an existing destination. It creates candidates and `evaluation-report.json`, never silently replaces serving files. Per-item scores include MAE/RMSE/WAPE/nonzero MAPE, validation/holdout periods, selected model, baseline, data size and gate. Reports include overall macro WAPE plus per-unit macro MAE/RMSE/WAPE/MAPE and cohorts. Volume cohorts use the pre-validation mean relative to the unit-specific median; ≥30% zero fitting days defines intermittent demand. Absent cohorts have no fabricated scores. Macro item metrics are not pooled accuracy, and quantities in different units are not added.

## Promotion and rollback

Code version fingerprints the compiled ML, infrastructure and operator-tool binaries. Artifacts/authorization receipts also record model/dataset/feature versions, framework, training time, validation/holdout periods and metrics. Preserve private write permissions: envelope SHA-256 is corruption detection, not an authenticated signature.

Initial installation requires the accepted holdout baseline gate and separately approved real-data provenance. Replacement additionally requires **>1% MAE improvement in both validation and holdout against the incumbent**, ≤10% holdout RMSE regression, and candidate holdout MAE ≤1.1× the selected baseline. The incumbent must have finished training strictly before the candidate validation period; otherwise comparison is denied as contaminated. Both models forecast the same dates using the same prior history; current fixed coefficients are not retrained during comparison. An unchanged version or unit mismatch is rejected.

```powershell
# Only after a data owner approves eligible REAL input and the comparison report:
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- promote new-candidates private-serving BUSINESS_UUID ITEM_UUID CURRENT_VERSION --approved-real-data
# For first installation, CURRENT_VERSION is the literal none.
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- rollback private-serving BUSINESS_UUID ITEM_UUID INSTALLED_VERSION RETAINED_BACKUP_FILE
```

Promotion rechecks the expected installed version under an exclusive per-item file lock. A durable authorization receipt precedes atomic replacement and a retained rollback envelope. On interruption, inspect the installed artifact version to determine whether replacement occurred; an authorization receipt alone is not proof it occurred. Rollback accepts only that item's retained private-directory backup, validates size/checksum/scope/metadata and preserves the replaced file. Serving still refuses stale, corrupt, unit-changed or history-changed artifacts after rollback. Back up model files and authorization records separately from the database.

The explicit `--approved-real-data` flag is an operator attestation, not a detector of fabricated data. No production model was installed in this phase. The promotion/rollback tests use clearly marked synthetic fixtures in temporary directories.

## Monitoring and business constraints

Prediction snapshots retain Business/item/model/input/time/horizon and daily central/lower/upper scenarios. Outcomes include imported or application actuals only when the entire horizon is complete and consistent. The new monitoring summary groups by model and horizon and calculates total-forecast MAE/RMSE/WAPE/nonzero MAPE. The latest five completed total errors exceeding the previous five by >50% produces a review alert after ten complete forecasts. Correlated overlapping horizons mean this is an operational threshold, not a statistical confidence test. No automatic retraining or purchase is triggered.

Reorder advice uses available stock (current minus reserved), forecast horizon and configured reorder threshold. The PostgreSQL business-rule test confirms that 100 units available and 10/day consumption over seven days do not produce a positive reorder when the configured buffer fits within stock. Supplier lead time, separate safety stock and per-location constraints are not available fields; the explanation identifies the threshold as the buffer and lead time as unknown. Bands remain uncalibrated scenarios, not guaranteed intervals.

**ML pipeline is production-capable but production model validation is blocked by absence of eligible historical business data.** Real dataset size/items/warehouses/evaluation dates/production accuracy/artifact remain unavailable. Synthetic reproducibility and recovery fixtures do not replace this gate.
