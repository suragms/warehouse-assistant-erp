> Historical checkpoint. Phase 3 supersedes current implementation/status claims here; see [final readiness](FINAL_PRODUCTION_READINESS_2026-10-03.md) and [final matrix](FINAL_PENDING_FEATURE_MATRIX_2026-10-03.md). The old invoice/WhatsApp-removal finding is corrected in the current AI parity report.

# ML Model and Pipeline Audit — 2026-10-03

## Finding

**Classification: A — no ML training or inference feature was implemented in either checked-out repository.** The reference contains deterministic purchase-history aggregation/recommendation logic, not a trained model. There is no registered model known to this repository. Classification D (a model maintained outside the repository) cannot be disproved without access to the owning deployment or artifact registry, but no external model endpoint/configuration was identified in the source.

## Search performed

- Scanned both `reference-repo/` and the main repository recursively, including hidden and ignored files, for `.pkl`, `.joblib`, `.onnx`, `.pt`, `.pth`, `.h5`, `.keras` and `.safetensors` artifacts, excluding generated dependency/build directories. No trained artifact was found.
- Searched all available Git refs/history file names for those serialized model formats; no artifact file was present in repository history.
- Searched source for training/splitting/evaluation libraries and operations (scikit-learn, PyTorch, TensorFlow, ONNX Runtime, `train_test_split`, model serialization) and for inference/prediction/forecast/anomaly/risk API paths. No model pipeline, inference package, model API or prediction endpoint was found.
- Checked both repositories’ model, training, notebook, feature-engineering and forecast-related paths. There is no training notebook, pipeline, dataset specification, model registry integration or CI training stage.
- The current reference source has no model artifact manifest or external inference URL. Historical `REFERENCE_AI_ML_EXTRACTION.md` is descriptive only and does not supply a pipeline/artifact.

## Closest existing capability

Reference `backend/app/services/trade_mapping.py` derives per-item/supplier/broker purchase insights from historical purchase rows using deterministic aggregation/VWAP-style calculations. The main app has reporting and deterministic reorder/low-stock values. These are database metrics/rules, not ML; none should be labeled a model prediction.

## No arbitrary model was trained

No training was run. The repository has no approved historical demand dataset, time-series grain, stockout censoring rules, promotion/seasonality labels, forecast horizon, evaluation threshold or business acceptance criteria. Training a generic model from an unspecified fixture would produce a demo score, not an honest inventory forecast.

## Proposed future service contract

Implement only after the business selects a use case and supplies a validated dataset.

**Candidate use case:** item demand forecast to support human-reviewed reorder decisions.

**Request:** server-derived BusinessId; CatalogItemId; forecast horizon; historical window; optional unit; requested timestamp. The client must not submit another tenant ID or raw cross-tenant training data.

**Response:** CatalogItemId; unit; one timestamped quantity estimate per future interval; lower/upper uncertainty bounds; horizon; model name/version; trained-at timestamp; generated-at timestamp; training-data-through timestamp; confidence/quality indicators; missing-data and cold-start warnings. Include no promise that the estimate is guaranteed.

**Controls:** training data scoped by tenant unless an explicitly approved and anonymized pooled model exists; no cross-tenant data leakage; models and datasets versioned; holdout/backtest evaluation against simple seasonal and naive baselines; alert on drift and error; model artifacts signed and checksum-verified; endpoint authorization mirrors stock/report permissions; no inventory mutation. Reorder calculations remain deterministic and auditable.

**Acceptance gate:** business-approved horizon and error metric; documented coverage by category/item age; minimum performance against baseline; backtest across seasonality and stockout periods; reproducible artifact build; security/privacy review; rollback to deterministic rules if the model is unavailable or fails quality checks.

## Status

- Trained model: **not found**.
- Training code/pipeline: **not found**.
- Inference implementation/API: **not implemented**.
- Artifact available in either repo or scanned Git history: **not found**.
- External model existence: **unknown**; no source evidence or endpoint configuration.
- Verification: source/history/ignored-file audit completed; training and inference correctly remain **blocked** pending a business-approved use case, validated dataset and artifact lifecycle.
