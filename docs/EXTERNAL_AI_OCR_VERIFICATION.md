# External integration verification — Phase 3

Updated 2026-10-04. Automated contract tests are not live provider evidence. No live AI, OCR, voice, email or WhatsApp credentials were supplied or printed, and no external message was sent.

## AI purchase intent and invoice text

Implemented adapters: OpenRouter, Gemini, Groq and OpenAI, with encrypted tenant keys, optional server fallback, provider/model policy, timeouts, bounded retry and circuit breaker. Purchase-intent and pasted-invoice extraction only return candidates for review. Deterministic invoice parsing works without a provider.

Remaining staging checks: configure an approved test account through owner credential settings or the secret store; verify masked save, restart/shared-key-ring decryption, supported model, valid parse, invalid/missing key, quota/timeout/fallback behavior, request authorization, actual latency and output quality, data retention/region terms and spend limits. Record provider/model/date/results without secrets or real purchase text.

## WhatsApp delivery

The target now has a real, locally tested outbound path. Set `WhatsApp__Enabled=true` and `WhatsApp__GraphVersion` to an account-supported version (for example the `vNN.0` format, not an assumed hardcoded version). Save `whatsapp_api_key`, `whatsapp_phone_number_id` and `whatsapp_staff_number` using the encrypted credential UI. The recipient must be reviewed and confirmed on the current purchase before sending.

The fixed HTTPS Graph host receives a PDF media upload and document-send request. Redirects are disabled; request logging is removed for this client; 45-second transport and 64KB response bounds apply. PDFs contain item names, quantities and units, without prices or financial totals. Provider acceptance is recorded as `accepted`, not verified recipient delivery. A duplicate request ID or accepted purchase does not resend. Known rejections are retryable explicitly; ambiguous outcomes and stale interrupted sends require the owner to verify in Meta that nothing was sent before retrying. A sending request within two minutes cannot be retried. Persistent version/unique constraints guard concurrent sends. There is no automatic retry or unverified delivery webhook.

Remaining external checks: approved business/phone/token permissions, recipient opt-in, account messaging-window/template requirements, selected Graph version, document delivery, network/quota limits and operator recovery procedure. No template campaign or push-message system is claimed. Contract source: [Meta WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-06605a2c-2b74-4d0a-a035-2c227eae61d1).

## Image OCR, voice and account recovery

The reference `/media/ocr` path handles pasted/plain text, including base64 decoded as UTF-8; it does not establish a functioning image OCR contract. Target invoice text parity is implemented. Actual image OCR, voice transcription and email/SMS password-recovery delivery remain unavailable until an approved adapter/provider and operating contract exist. Authenticated password changes and session revocation are implemented. Recovery endpoints remain explicitly unavailable and do not reveal account existence or mint usable reset tokens.

## Camera and printing

Barcode camera lookup is local to supported secure browsers; frames are not uploaded. Permission denial/unsupported browsers retain typed/USB lookup, and streams stop on completion, cancellation and unmount. Barcode labels use locally bundled [JsBarcode](https://github.com/lindell/JsBarcode) Code 128 and browser print/Save PDF. Browser automation verifies generated bars, print visibility and fallback/denial, not physical camera or scanner accuracy. [BarcodeDetector availability](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) varies by browser. Physical camera, printer, scanner, keyboard and installed-PWA checks require devices.

## Deployment qualification

Private PostgreSQL restore/extract/train/serve tests passed on synthetic data with real local owner authentication. Production-copy restore, RTO/RPO, backup retention/encryption, actual reverse proxy/TLS/cookie behavior, shared key-ring operation and multi-instance realtime need the deployment environment. Production ML additionally needs eligible real confirmed consumption history and accepted per-item baseline comparisons. None of these dependencies is replaced by a mock or synthetic forecast.
