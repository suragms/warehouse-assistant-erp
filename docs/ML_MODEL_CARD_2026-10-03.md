# ML model card — Phase 3

## Phase 4 update — 2026-10-04

No eligible real historical dataset, operational ML connection or production artifact was available. **ML pipeline is production-capable but production model validation is blocked by absence of eligible historical business data.** Real dataset size, source period, item/warehouse counts, validation/holdout dates and production MAE/RMSE/WAPE/MAPE remain unavailable. The synthetic results below remain implementation evidence only.

Added attested historical daily-consumption CSV preview/transactional import, immutable raw/source provenance, scoped dataset extraction, per-unit/cohort reports, compiled-pipeline code fingerprints, guarded candidate promotion with untouched-date comparison and rollback, and complete-outcome degradation metrics/review alerts. No production model was promoted. See [import/promotion contract](HISTORICAL_CONSUMPTION_AND_MODEL_PROMOTION_2026-10-04.md) and [Phase 4 verification](FINAL_PRODUCTION_VERIFICATION_2026-10-04.md). Core features, temporal windows and baseline remain unchanged; metadata now includes the recorded code version. Legacy artifacts can serve under existing safeguards, but cannot be promoted as new candidates without that evidence.

Last verified 2026-10-04. **Production deployment: not trained or approved. Real-business accuracy: not measured.** The pipeline is implemented; no eligible operational dataset or production database connection was supplied. Do not deploy the verification artifact below.

## Intended use

Human-reviewed planning of 7/14/30-day recorded item consumption in one Business warehouse. Forecasts inform reorder quantities and stockout scenarios; they do not finalize purchases, write stock or estimate fraud. Not a model of unconstrained customer demand, sales revenue, supplier lead time or calibrated stockout probability.

## Model and data contract

| Field | Value |
|---|---|
| Artifact schema | 1 |
| Feature/algorithm version | `daily-confirmed-usage-v1` |
| Candidates | Seven-day moving mean, seasonal lag 7, standardized ridge regression |
| Selection | Validation MAE; ridge must beat the better baseline by >1% |
| Holdout gate | Selected MAE ≤ 1.1 × baseline MAE, plus numerical tolerance |
| Framework | C#/.NET 10, version embedded in each artifact; no external ML runtime |
| Label | Explicitly confirmed `DailyUsageLogs.UsedQty` or validated, owner-attested historical daily-consumption totals; never purchases/snapshots relabelled as consumption |
| Features | Lag 1/7/14; mean 7/28; weekday sine/cosine |
| Scope | Independently trained per Business and item; fixed item unit |
| Eligibility | 120–730 consecutive completed UTC days through extraction's yesterday |
| Validation | Chronological 30-day validation then 30-day holdout; recursive forecasts |
| Final fit | Selected algorithm refitted on all eligible data after holdout evaluation |
| Production dataset / dates / artifact | Unavailable; must be recorded after approved real extraction |
| Production MAE/RMSE/WAPE/MAPE/R² | **Not measured** |

Missing days are unknown, not zero. Explicit zeros are valid. Invalid/negative/nonfinite/oversized quantities, future or late-recorded observations and conflicting daily duplicates are rejected. The contact CSV found in both references is not training data.

## Synthetic reproducibility evidence — NOT business accuracy

`scripts/verify-ml-reproducibility.ps1` uses 180 generated days of `20 + 0.15 × dayIndex + 2 × weekday`, in KG, 2026-04-06–2026-10-02. Initial fit: 2026-04-06–2026-08-03. Validation: 2026-08-04–2026-09-02. Holdout: 2026-09-03–2026-10-02. This deliberately simple trend/weekly pattern checks implementation only.

| Candidate | Validation MAE | Validation RMSE | Validation WAPE |
|---|---:|---:|---:|
| Mean 7 | 3.974247 | 4.960754 | 8.619369% |
| Seasonal 7 | 2.800000 | 3.091116 | 6.072655% |
| Ridge (selected) | 0.123648 | 0.152358 | 0.268167% |

| Held-out measure | Ridge | Selected baseline (seasonal 7) |
|---|---:|---:|
| MAE (KG) | 0.127712 | 2.800000 |
| RMSE (KG) | 0.155238 | 3.091116 |
| WAPE | 0.251031% | 5.503686% |
| Nonzero-only MAPE | 0.248094% | 5.456940% |
| R² | 0.998580 | 0.437134 |
| Days / nonzero days | 30 / 30 | 30 / 30 |

Two CLI runs returned identical model parameters, metrics and versions. Synthetic dataset hash: `8ccce22428dce5a1e4cbc815acc104585e89ce5b19e3b327abe7f8cc6c84b3d3`. Artifact version appends `-daily-confirmed-usage-v1-ridge`. Latest evidence is in ignored `TestResults/phase4-ml-repro.log` (earlier checkpoint: `phase3-ml-repro.log`); rerun the script to generate fresh artifacts. No generated model or dataset is committed.

## Limits and failure cases

- Observed usage can be censored by stockouts or inconsistent operator recording; it is not proven true demand. Changes in workflow or item units require review/retraining.
- Only 30 days each of validation and holdout are available at minimum eligibility. There is no rolling-origin multi-season accuracy claim, causal model, holiday/promotion feature or supplier lead-time estimate.
- Recursive forecasts accumulate error. Sparse/intermittent/new items may be better served by manual rules or a selected baseline; missing history returns no forecast.
- MAE is scale-dependent. RMSE emphasizes large errors. WAPE is undefined with zero total demand. MAPE excludes zero actuals and can exaggerate small denominators. R² is null for constant targets and can be negative.
- Error bands are uncalibrated holdout-based scenarios, not guaranteed coverage. Risk categories are business rules, not learned probabilities.
- The artifact is refused after 31 days without retraining, if its unit/history changes, or if loading/metadata/checksum fails. Serving recalculates features from current valid history but never silently retrains.
- Statistical movement anomalies need 20 prior comparable movements and do not establish error, theft or fraud. Financial-price anomalies are not claimed.
- Per-item training is intentionally conservative; no cross-tenant transfer of data or pooled modeling occurs.

## Verification and operating responsibility

Automated tests cover invalid/missing/duplicate/zero data, date rules, no future feature leakage, deterministic training, artifact corruption and scope mismatch, missing/stale/changed history, inference, current membership/permissions, staff operational-field visibility, PostgreSQL persistence/deduplication, UI loading/error/empty/success and outcome states. The restore rehearsal verifies offline extraction → training → real authenticated HTTP inference/export, using only synthetic data.

Before deployment, the operator must provide an eligible real dataset, review data provenance and per-item scores against the baseline, record accepted artifact versions here, configure private storage, and verify later outcomes. An accepted synthetic artifact is not a substitute. Monitoring stores model/input versions and immutable predictions; complete confirmed horizons are compared with actuals in the UI. See [architecture and reproduction commands](ML_ARCHITECTURE_2026-10-03.md).
