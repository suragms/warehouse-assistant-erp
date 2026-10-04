# AI feature parity — Phase 3 final review

Verified against both `reference-repo/` and `backend/reference-repo/`, including backend routers/services, `main.py`, migrations and `flutter_app/lib`. Updated 2026-10-04.

**Correction to the earlier audit:** migration 066 is not evidence that all invoice/WhatsApp features are absent. The checked-out reference has an active conditional media router, `bill_line_extract.py`, `ocr_parser.py`, `llm_failover.py`, owner delivery endpoints, `whatsapp_po_delivery.py`, and later migration 070. Earlier claims that these executable paths were removed were incorrect.

| Capability | Executable reference evidence | Target implementation and verification |
|---|---|---|
| Text purchase intent | Provider-backed extraction concepts and failover | Existing purchase-intent API/UI retained; exact tenant candidate matching, quantity validation, ambiguity review, no model-supplied IDs/prices or writes. Parser, endpoint and browser tests pass. Live provider unverified. |
| Invoice text extraction | `routers/media.py` `/ocr`, `services/bill_line_extract.py`, `services/ocr_parser.py` | `POST /api/v1/ai/invoice-text`; deterministic explicit-line extraction or opt-in configured AI JSON extraction. Purchase form preview and reviewed quantity application. Max 20,000 characters/200 lines, bounded request, tenant catalog matching, unit checks, rate/financial redaction. No purchase or stock writes. Contract/RBAC/UI tests pass. |
| Actual image OCR | Reference media route decodes base64 as UTF-8 text; no verified image-to-text engine in that path | Not represented as image recognition. Paste actual text or use the ordinary form. A real image OCR adapter needs an approved provider/input/retention contract and credentials. No invented confidence percentages are copied. |
| Provider policy | Ordered fallback with provider keys/models | Owner/Admin/SuperAdmin settings configure enabled state, provider order, supported model names, 1–20s per-attempt timeout and 0–1 retry. Sequential fallback, 200ms retry delay, circuit opens after 3 failures for 60s, isolated by Business/policy version/provider. Whole purchase request remains bounded at 45s. Tests cover retry, open/reset, tenant-key separation, failover and failure normalization. |
| Provider keys | Encrypted business integration credentials | Existing Data Protection encryption/masking, optimistic updates, current membership and allowlist retained. Settings never returns a saved secret. Fixed provider hosts; no arbitrary upstream URL. Stable production key ring still needs deployment verification. |
| WhatsApp purchase PDF | `services/whatsapp_po_delivery.py`, owner routes, migration 070 | Owner-only preview and confirmed send on purchase details. Encrypted credential resolution, configured Graph version, current recipient/order confirmation, quantity-only PDF, upload/send, persistent attempts/status, concurrency, explicit retries and safe audit. Local HTTP-contract and browser tests pass; no live message was sent. |
| Grounded conversational warehouse assistant | Health comment says assistant ready, but no corresponding active assistant query router was found in either checked-out tree | Not invented from a comment. Actual reports, stock filters, supplier history, purchase intent and predictions provide the available workflows. |
| AI narrative summaries/anomaly explanations | No verified generative report-summary route found | Database-derived reports and transparent statistical explanations are labelled as such. Not falsely presented as LLM output. |
| ML predictions | No trained artifact or reproducible training pipeline found | New explicit user-requested pipeline implemented; see ML architecture/model card. Production data/artifact and business accuracy remain unavailable. |
| Voice | Historical scripts mention a voice stub; no verified target speech provider contract | No fake transcription or voice-success route. Requires a chosen accessible device/provider contract before integration. |

## Data and authority boundaries

AI runs after current membership/permission checks. Context is scoped to the active Business and bounded. Model-provided IDs are ignored in favor of validated tenant matches. Prompt injection cannot acquire a write tool: extraction services have no purchase/stock mutation authority. Prices never become authoritative from AI output; normal purchase preview, validation and explicit confirmation still apply. Staff cannot obtain owner financial fields through AI or invoice responses.

`StubAIProvider` is a deliberate non-success sentinel: it does not simulate an answer. Missing credentials skip the adapter before a network request. Provider exception bodies, prompts and API keys are not logged. Usage telemetry records bounded metadata, not prompt/response content.

Live key acceptance, actual model availability/output quality, quota, account limits, network egress, deployed key-ring decryption and WhatsApp delivery remain external checks. [External verification](EXTERNAL_AI_OCR_VERIFICATION.md) records the exact boundary.
