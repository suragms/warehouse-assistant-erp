# External provider contracts — Phase 4

**Live providers verified: zero.** No eligible configured credentials or operational database connection were available. No live provider success, WhatsApp delivery, image OCR, transcription or recovery delivery is claimed. Configure secrets through encrypted owner settings or the deployment secret store, never through source or chat.

## Implemented AI adapters

| Provider | Authentication / configured secret | Request contract | Response contract | Verification |
|---|---|---|---|---|
| OpenAI | Bearer; tenant `openai_key` or server `AI__Providers__OpenAI__ApiKey` | Fixed `api.openai.com/v1/chat/completions`; selected model, system/user messages, temperature 0 | `choices[0].message.content`, then validated purchase/invoice candidate JSON | Transport/model/error/bounds tests pass; LIVE EXTERNAL VERIFICATION REQUIRED |
| Groq | Bearer; `groq_key` or equivalent server provider secret | Fixed `api.groq.com/openai/v1/chat/completions`; selected model and messages | Same chat envelope | Configured model override corrected; LIVE EXTERNAL VERIFICATION REQUIRED |
| OpenRouter | Bearer; `openrouter_key` or equivalent server provider secret | Fixed `openrouter.ai/api/v1/chat/completions`; selected model and messages | Same chat envelope | Transport/model/error/bounds tests pass; LIVE EXTERNAL VERIFICATION REQUIRED |
| Gemini | `x-goog-api-key`; `gemini_key` or equivalent server provider secret | Fixed `generativelanguage.googleapis.com/v1beta/models/{escaped-selected-model}:generateContent`; system instruction and contents | `candidates[0].content.parts[0].text` | Configured model override corrected; LIVE EXTERNAL VERIFICATION REQUIRED |

Historical fallback model names remain compatibility defaults, not evidence of current account availability. The owner must select and verify an account-supported model; no guessed latest model is installed. Masked key persistence, tenant credential selection and policy order/enablement are verified locally. Encryption requires a persistent shared Data Protection key ring in deployment; local ephemeral test encryption is not restart/multi-instance qualification.

Router deadline is configurable 1–20 seconds per attempt, retry count 0–1; overall parsing has a 45-second deadline. HTTP clients cap buffered responses at 1 MB, use a 20-second transport ceiling, disable redirects and remove request loggers. Credentials cannot be forwarded to a redirect target; upstream bodies/prompts/keys never become public errors. 401/403 normalize to authentication failure; other permanent client/model failures are not retried. 408/timeouts, 429 and 5xx/network failures are transient. An optional retry waits at least the bounded upstream `Retry-After` plus jitter where possible; a delay above two seconds defers that provider instead of shortening its requested backoff. The tenant/policy/provider circuit opens after three failures for 60 seconds. Cancellation stops work. No key/no provider returns an explicit error and no fabricated candidate.

The failure contracts were cross-checked against official [OpenAI errors](https://developers.openai.com/api/docs/guides/error-codes), [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Groq errors](https://console.groq.com/docs/errors) and [OpenRouter quickstart](https://openrouter.ai/docs/quickstart). Provider documentation supports contract choices; it is not evidence that this application's account/key/model has been exercised.

To qualify a live deployment, use an approved synthetic prompt and test account: verify authentication and model existence, system instruction/response parsing, encrypted save/restart, actual latency, quotas, authorized invalid-key rejection, timeout/fallback/circuit recovery and account-specific data/spend terms. Record provider/model/date/status and redacted request IDs. Use controlled transport tests for outages rather than deliberately exhausting a live quota. Only a successful authorized real request can establish LIVE VERIFIED.

## WhatsApp

| Contract field | Implemented boundary / remaining evidence |
|---|---|
| Provider | Meta Graph WhatsApp Cloud API; outbound document only |
| Configuration | `WhatsApp__Enabled`, account-supported `WhatsApp__GraphVersion`; encrypted `whatsapp_api_key`, `whatsapp_phone_number_id`, `whatsapp_staff_number` |
| Authentication | Bearer token to fixed HTTPS `graph.facebook.com`; redirects disabled; logging removed |
| Recipient | Owner/SuperAdmin reviews configured numeric recipient and confirms it against the current confirmed purchase/version |
| Request | Multipart PDF upload with `messaging_product=whatsapp`, then JSON document message with media ID and confirmed recipient; PDF quantities/units omit prices |
| Response | Bounded 64 KB upload/message JSON; persisted provider IDs and `accepted` acknowledgement, never a fabricated delivered status |
| Deadline / retry | 45 seconds; no automatic resend. Unique request/purchase state and optimistic version guard repeat/concurrent attempts |
| Failure | Known rejection = failed; ambiguous network/send outcome = unknown. Recent sending cannot retry; stale/unknown attempts require an explicit owner verification that Meta did not deliver before retry |
| Audit / tests | Persistent delivery attempts, role/tenant/recipient/version/document/state/timeout/retry contract tests. No inbound delivery webhook is registered; untrusted callbacks cannot mark delivery |
| Live remaining | Approved account/phone/token, recipient opt-in, supported Graph version, actual document receipt and account messaging-window/template policy. Direct document messaging is the supported local contract; no template-campaign adapter is claimed |

**LIVE EXTERNAL VERIFICATION REQUIRED.** No message was sent. Account-specific requirements must be verified with the [Meta Cloud API contract](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-06605a2c-2b74-4d0a-a035-2c227eae61d1) and approved operator policy before enabling delivery.

## Other optional contracts

| Feature | Provider/configuration | Request/response | Timeout/retry | Failure and local evidence |
|---|---|---|---|---|
| Pasted invoice text | Local validated parser; optional AI adapters above | Text ≤20,000 chars / 200 lines; quantity/unit/name candidates, tenant lookup and staff price redaction; reviewed application only | Optional provider flow bounded by 45 seconds | Works without OCR credentials; invalid/ambiguous input reports issues, never commits purchases automatically |
| True image OCR | No approved adapter/provider/configuration | No supported external image request or OCR response contract. Legacy base64 UTF-8 decoding is not image recognition | Not applicable; no outbound OCR call | Explicitly unavailable. Core stock/purchase/manual invoice workflows continue; requires provider contract, privacy/storage limits and authorized credentials |
| Voice transcription | No approved adapter/provider/configuration | No supported external audio/response contract | Not applicable; no outbound speech call | Explicitly unavailable; typed input continues. Requires supported audio formats/language/size/privacy/credential contract |
| Email/SMS password recovery | No approved delivery adapter/provider/configuration | Forgot/reset routes return controlled unavailable responses; no deliverable reset token is minted | Not applicable; no outbound delivery attempt | HTTP 503 without account enumeration. Authenticated password change and session revocation work; requires approved delivery/token-expiry/recipient/abuse contract |
| Barcode camera | Browser-local `BarcodeDetector` / `getUserMedia`, secure context | Frames remain local; recognized code uses authorized lookup | User initiated; streams stop on detection/cancel/unmount; no cloud retry | Capability/denial handling and typed/USB fallback tested. PHYSICAL DEVICE VERIFICATION PENDING |

Optional-provider absence does not prevent login, catalog, stock, purchases, reports or manual input. Unavailable adapters are not simulated successes. Selecting and qualifying these provider contracts is external work; this phase does not invent arbitrary endpoints or credentials.
