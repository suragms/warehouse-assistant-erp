# ML architecture — Phase 3

Phase 4 adds trusted historical-consumption provenance, chunked extraction, candidate-only training, guarded promotion/rollback and degradation summaries. The [Phase 4 contract](HISTORICAL_CONSUMPTION_AND_MODEL_PROMOTION_2026-10-04.md) supersedes the operator storage/import details below. Training now refuses an existing candidate directory; replacing a serving artifact requires the explicit promotion path. No real-data accuracy is available.

Implemented and verified locally on 2026-10-04. File date follows the requested Phase 3 naming convention. See [model card](ML_MODEL_CARD_2026-10-03.md) for the distinction between pipeline verification and production accuracy.

## Problem and available data

Forecast **recorded daily item consumption**, separately for each Business and item. Business membership is the warehouse boundary; see [warehouse decision](WAREHOUSE_MODEL_DECISION.md). Purchases are replenishment, stock adjustments are corrections, and neither is substituted for demand.

The source is `DailyUsageLogs.UsedQty`, with `Date`, `CatalogItemId`, `BusinessId`, `LoggedAt` and the new `IsConfirmed` flag. Explicit Daily Operations submissions, including zero, are confirmed. Scheduled snapshots are not. The migration only confirms older rows with matching DailyUsage stock-ledger provenance. Anomalies use `StockMovements`; current and reserved stock plus the configured reorder level drive recommendations.

Both reference copies contain a supplier/customer contact CSV (`data/supplers/Customer List.csv`), not an eligible consumption dataset. No approved operational connection in `ML_DATABASE` or application User Secrets was available. Consequently no production model or real-business accuracy is claimed. The private PostgreSQL and CLI verification datasets are explicitly synthetic and must not be deployed.

## Components

| Component | Responsibility |
|---|---|
| `ml/PurchaseAssistant.ML/Data.cs` | Validate daily labels, remove conflicts, retain consecutive history, canonical fingerprint |
| `ForecastModel.cs` | Lag/rolling features, deterministic ridge and baselines, temporal evaluation, recursive inference |
| `ArtifactStore.cs` | Scoped artifact paths, JSON checksum envelope, metadata validation and atomic replacement |
| `ml/PurchaseAssistant.ML.Tool` | Operator-only inspect, extract and train; never called by HTTP requests |
| `Infrastructure/Services/MlService.cs` | Tenant/permission checks, stock advice, anomaly detection, immutable prediction/outcome history |
| `Web/Controllers/MlController.cs` | Authenticated, rate-limited API and controlled timeout |
| `frontend/src/pages/MlPage.tsx` | Item selection, history/forecast tables, metrics, stockout scenarios, reorder advice, anomalies and outcomes |

## Data rules and leakage prevention

1. Extract active tenant catalog items, at most 10,000, and at most 1,500 observations per item over the last 730 days. Output is a new operator-selected file. No keys, prices or personal records enter this dataset.
2. Keep completed days before extraction's UTC date, explicitly confirmed quantities from 0 through 1,000,000,000, finite values, and valid timestamps no later than extraction. Recording date must equal observation date. This conservatively excludes late retrospective edits that could leak future corrections into training.
3. Normalize quantity to four decimals. Identical daily duplicates collapse; conflicting duplicate dates are unknown and excluded. Missing days are never filled with zero.
4. Keep the contiguous suffix ending yesterday. Require at least 120 days. A gap or no record yesterday makes forecasting unavailable until sufficient new consecutive history exists.
5. Canonical SHA-256 input version covers date plus fixed-four-decimal quantity. Item and Business scope are separate artifact metadata. Corrected training history invalidates serving until retraining.
6. Initial fitting uses history before the last 60 days. The next 30 days select the model; the final 30 days are a held-out quality gate. No random split or future rolling windows are used. Each window is forecast recursively without substituting actual future labels.

## Models and evaluation

Candidates are recursive seven-day mean, seven-day seasonal persistence, and deterministic standardized ridge regression (L2 penalty 1; intercept unpenalized). Ridge features are lag 1/7/14, trailing means 7/28, and weekday sine/cosine. Scaling is fitted on each training window only.

Select the better baseline by validation MAE. Choose ridge only when validation MAE improves by more than 1%. Evaluate the selected model and that baseline on the untouched 30-day holdout. Accept only if selected MAE is no worse than baseline MAE × 1.1 plus numerical tolerance. After recording that evaluation, refit the selected algorithm on all eligible observations for deployment. Held-out metrics describe the pre-holdout fitted model; they are not in-sample scores of the final refit.

Store MAE, RMSE, WAPE, nonzero-only MAPE, R², sample counts and nonzero counts. WAPE/MAPE are null for all-zero demand; R² is null for constant demand. R² never selects the model. Baselines can legitimately win; the API reports the actual selected algorithm.

## Recommendations and anomalies

- API horizons: 7, 14 or 30 days. No training occurs during inference.
- Available stock = system stock − reserved stock.
- Reorder quantity = max(0, horizon forecast + configured reorder threshold − available stock). Threshold date is the first cumulative forecast crossing available stock less that threshold, or today if already below it. Supplier lead time is unknown; this is not a promised ordering deadline.
- Lower/upper daily scenarios use the holdout 90th-percentile absolute error. These are heuristic scenarios, not calibrated confidence intervals. Stockout categories compare available stock to cumulative lower/central/upper scenarios; there is no learned probability or arbitrary confidence score.
- Movement anomalies compare a recent movement to up to 60 strictly earlier movements of the same type and sign, requiring 20 observations. Robust MAD z-score ≥ 3.5 is flagged; constant histories use an explicit quantity > 3× median rule. Read at most 2,000 movements over 180 days, return at most 50 flags from 30 days. Flags call for review and do not allege fraud. No price-fraud model is claimed.

## API, access and failure states

| Route | Purpose |
|---|---|
| `GET /api/v1/ml/items?search=&page=&pageSize=` | Active tenant item picker, max 100 per page |
| `GET /api/v1/ml/items/{id}?horizon=7` | History, forecast, advice, anomalies, model and metrics |
| `GET /api/v1/ml/items/{id}/monitoring` | Latest 100 prediction outcomes from at most two years |
| `GET /api/v1/exports/ml/{id}.csv?horizon=7` | Server-generated forecast export; also requires the existing report-export role/permission |

All ML routes require current Business membership and `stock.view`, have no-store responses and a 60/minute ML rate limit. Analysis has a 15-second deadline. Business/item substitution cannot select another tenant's records or artifacts. Quantities are operational fields available to authorized staff; financial fields remain protected. The CSV does not bypass export policy.

No forecast is returned for insufficient history, missing/unreadable/corrupt artifacts, failed quality gates, changed units, future/stale training dates (more than 31 days), changed training history, or invalid inference. Database and request failures produce controlled API errors and a UI retry. Empty/error screens do not contain fabricated charts or zeros. Forecasts do not change stock or create purchases.

## Artifacts and monitoring

Set server `ML__ArtifactPath` to a private directory readable by the API identity. Files are `<BusinessId N>/<ItemId N>.json`; paths never come from request strings. Envelope SHA-256 detects accidental corruption; it is **not a signature**. Restrict directory writes to the training/deployment operator. Artifacts include raw per-item quantity history and must not be public web assets.

Schema version 1 includes algorithm, coefficients/scales, feature and dataset versions, framework version, training timestamp, dates, validation/baseline/holdout scores, residual statistic and gate outcome. Size is limited to 1 MB; metadata, contiguous history, finite values, scope, version and fingerprint are validated. The same dataset/algorithm gives the same model version and parameters; training timestamps may differ. Bump the feature/algorithm version when changing training semantics or hyperparameters.

Serving records one immutable snapshot per Business/item/day/horizon/model/input version. A PostgreSQL unique index prevents duplicate concurrent requests. Outcomes are joined to later valid confirmed daily usage, showing a total only when every horizon day is available. Corrections may change the displayed actual outcome; the original prediction remains immutable. Review the Predictions “Prediction outcomes” panel before retraining. Drift alerts or automated retraining are not implied by this basic metadata implementation.

## Reproduce and deploy

Requirements: .NET SDK 10, PostgreSQL target schema migrated, operator database access and a private artifact directory. No Python ML packages, GPU, cloud ML service or training in the web process is required. Run from the repository root in PowerShell:

```powershell
dotnet restore backend/PurchaseAssistant.slnx
dotnet ef database update --project backend/PurchaseAssistant.Infrastructure --startup-project backend/PurchaseAssistant.Web --configuration Release
# Inject ML_DATABASE through your environment secret store; never put its value in a command argument.
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- inspect
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- extract <business-guid> <new-private-dataset.json>
dotnet run --project ml/PurchaseAssistant.ML.Tool -c Release -- train <private-dataset.json> <private-candidate-model-directory>
```

Review each item's dates, rejected/missing source data, validation scores, baseline comparison and `QualityAccepted`. A successful tool exit means training completed, not production approval or universal quality acceptance. Back up the current artifact, then copy only the accepted item artifact into the configured `ML__ArtifactPath`, using atomic replacement. The API loads on request; it needs no training restart. Validate the real authenticated API and compare later outcomes. Roll back by restoring the previous compatible artifact; stale/history-invalid artifacts will still be rejected.

For synthetic mechanics only, run `pwsh -File scripts/verify-ml-reproducibility.ps1`. It generates a clearly named synthetic file in a new ignored TestResults directory, trains twice, and compares parameters, versions and metrics. `scripts/run-postgres-restore-rehearsal.ps1` additionally tests extraction → training → serving against synthetic restored PostgreSQL records with real owner authentication. Neither result measures real demand accuracy.
