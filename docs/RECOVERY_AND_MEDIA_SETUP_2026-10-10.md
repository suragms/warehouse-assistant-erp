# Password recovery, invoice images and voice recordings

The user selected SMTP and the existing AI providers on 2026-10-10. Implemented SMTP recovery, Gemini invoice-image transcription and Groq audio transcription. These adapters are disabled until configured. No live email, OCR or speech request was sent during development; local transport fixtures are not live delivery evidence.

## Deployment configuration

Apply the `Phase5PasswordRecovery` migration through the existing deployment migration procedure. It adds `PasswordRecoveries`; the user password hash also becomes an optimistic concurrency guard. Back up the database and persistent Data Protection key ring together. All application instances must share the existing encrypted key ring. Never paste SMTP passwords or provider keys into source, chat, a command argument or a browser URL.

Use the deployment secret/configuration store for the following names (`__` is the environment-variable separator). Configuration presence does not establish provider availability.

| Setting | Required value / meaning |
|---|---|
| `Recovery__Enabled` | `true` after SMTP and the reset page are qualified |
| `Recovery__ResetPageUrl` | Fixed public HTTPS URL ending in `/reset-password`; no query, fragment or user information. Never derived from a request Host header |
| `Recovery__Smtp__Host` | Approved SMTP hostname |
| `Recovery__Smtp__Port` | Provider's SMTP port, 1–65535 |
| `Recovery__Smtp__Security` | Exactly `StartTls` or `SslOnConnect`; plaintext and opportunistic downgrade are unavailable |
| `Recovery__Smtp__From` | Approved sender mailbox |
| `Recovery__Smtp__Username`, `Recovery__Smtp__Password` | Both supplied through the secret store, or both omitted for an approved TLS relay |
| `AI__Enabled` | Existing global AI switch must be enabled for media |
| `Media__Ocr__Enabled`, `Media__Ocr__Model` | Enable Gemini image transcription and explicitly select an account-supported vision model |
| `Media__Voice__Enabled`, `Media__Voice__Model` | Enable Groq transcription and explicitly select an account-supported speech model |
| Existing tenant `gemini_key`, `groq_key` | Saved through encrypted owner credential settings; resolved within the current Business |
| `AI__Providers__Gemini__ApiKey`, `AI__Providers__Groq__ApiKey` | Existing optional server secret fallback when that tenant has no usable key |

The current Business AI policy must also be enabled and include Gemini/Groq respectively. Media model settings are separate from text-chat model overrides: a chat model is not assumed to support audio transcription. No model name is guessed or silently installed. Supported adapters are Gemini images and Groq speech; other existing providers continue their existing text workflows.

## Password recovery behavior

The login page links to `/forgot-password`; reset mail links to `/reset-password`. Anonymous requests use the existing IP limiter. Active accounts can queue at most three requests per 15 minutes; PostgreSQL row locking enforces this across concurrent callers and application instances. Known, unknown, inactive and recipient-throttled requests receive the same HTTP 202 message when SMTP is configured. It says instructions may be queued, not that mail was delivered. There is no synchronous SMTP timing difference in that endpoint.

Each link contains 256 random bits, expires after 30 minutes, and is bound to the original account email and password version. A SHA-256 digest supports validation; the token is Data Protection encrypted only while awaiting delivery. The token and email use a URL fragment, which is removed after the reset page reads it. The frontend uses a no-referrer policy. Requests never return the token or disclose account membership.

A background worker atomically claims each queued message once. SMTP requires certificate-validated TLS, has a 20-second deadline, and has no automatic resend after ambiguous failure. `accepted` means SMTP accepted the message, not inbox delivery. A worker interruption after claim can leave `sending`; the user can request a fresh link subject to the recipient limit. No SMTP credentials, reset tokens, message bodies or raw transport errors are logged.

Reset validates the token, account state, original email/password and password bounds (at least eight characters, at most 72 UTF-8 bytes). Password change, token consumption, session revocation and security audit commit together. Concurrency guards allow only one of competing reset tokens to succeed. Existing links stop working after any password change; login also rejects a session created across a concurrent password change. Recovery operates on the global user account, rather than permitting a caller to select a warehouse or another user's ID.

After a delivery attempt, encrypted token material is cleared. While the enabled worker runs, expired token material is cleared and metadata older than seven days is deleted. The immutable security audit remains. Database backups require restricted access because they contain account metadata and encrypted pending messages. Disabling or misconfiguring SMTP returns HTTP 503 without breaking ordinary login or authenticated password change.

## Image and voice workflow

Inside the existing purchase helper, **Read an invoice image** accepts PNG/JPEG and fills the editable invoice-text field only after review. **Transcribe a voice recording** accepts recorded WAV, WebM, MP3 or M4A and fills the editable purchase request only after review. This release supports audio-file upload; it does not claim a native microphone recorder or verified physical-device capture.

Each upload requires explicit approval to send the selected file to the named provider. The current user must have purchase-create permission and an active Business membership. Capabilities and responses are private/no-store. Changing tenant remounts the existing scoped application and clears transient state; component disposal cancels a pending request. Extraction never creates stock, purchases or payments.

Server limits are 5 MiB decoded media and 7.1 MB request bodies. Images must decode as PNG/JPEG, have at most 16 million pixels and at most 8192 pixels per side; they are re-encoded without metadata before transmission. Audio must have a matching supported MIME type and container signature; the provider performs actual audio decoding. Files are processed in memory and are not written to application media storage. Recordings have a byte limit, not a guaranteed duration limit.

The backend uses fixed HTTPS provider hosts, disabled redirects, no request loggers, a 128 KB response ceiling and a 30-second deadline. It makes one attempt: no automatic paid retry, media fallback to another provider or background resubmission. A tenant/policy/provider circuit temporarily blocks repeated failures. Provider bodies and credentials never become public errors. Empty, malformed, oversized and incomplete image responses are rejected. Text is bounded to 20,000 characters; the voice purchase-input UI accepts at most 4,000. Users review and correct it before existing text parsing/catalog matching and purchase confirmation.

Attempted media calls record only scoped feature/provider/latency metadata; raw files and returned text are not persisted in usage history. Disabled/unconfigured and circuit-blocked requests do not fabricate usage success. Provider-side storage and retention remain subject to the account's approved terms.

Contracts were checked against [Gemini image input](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding), [Groq speech transcription](https://console.groq.com/docs/speech-to-text) and [MailKit SMTP transport](https://mimekit.net/docs/html/T_MailKit_Net_Smtp_SmtpClient.htm). Documentation is not evidence of this deployment's credentials, model access or delivery quality.

## Live qualification still required

Use an approved test mailbox to verify actual receipt, sender authentication and spam handling, reset-link expiry/reuse, and sign-out on all devices. Verify the deployed HTTPS reset route and shared key ring. Use approved nonsensitive image/audio fixtures with the configured model accounts to verify extraction quality, supported language, actual limits, quotas and account retention terms. Only then record those services as live verified.

WhatsApp's implemented outbound workflow still requires its approved account/recipient and actual delivery evidence. Real ML training still requires eligible owner-approved daily consumption; purchases and synthetic fixtures are not substitutes. Production restore/traffic and physical Android/iOS/scanner qualification remain separate environmental requirements.
