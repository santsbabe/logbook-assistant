# Control Centre — private cross-device copies and Gmail background worker

Status: QA code + automated tests. Neither full bidirectional sync nor an unattended Gmail service is live.

## Private Google Drive copies

QA More now exposes explicit Authorise & save and Find latest private copy actions. OAuth requests the narrow Google Drive appdata scope. Access tokens stay in browser memory; there are no refresh tokens or household backup files in the public repository.

Every upload creates a NEW uniquely named JSON snapshot in the app's hidden Google Drive folder, without replacing any existing remote copy. The user can inspect the most recent snapshot and its task count. Restoring to this device requires typing RESTORE and downloads a local backup before replacing local data. The original version is kept through the existing local rollback writer.

This is manual, explicitly authorised, private cross-device TRANSFER. It is NOT automated two-way synchronisation; conflicting edits on different devices are not silently merged. The official Drive appData guidance documents the storage and its limitations:
https://developers.google.com/workspace/drive/api/guides/appdata

## Gmail background processing module

services/control-centre/gmail-worker.cjs contains a host-independent, tested polling worker. It requires all the following dependencies from a trusted private backend:

- An authenticated server-side Gmail OAuth access token, obtained from securely stored and revocable offline credentials.
- A verified, server-derived per-account namespace. Never use a namespace controlled by an anonymous caller.
- A Gmail transport, durable per-account message idempotency database and committed pagination cursor.
- A private action-queue sink whose deliver method is idempotent by account + Gmail message ID.

Worker contract: list bounded Gmail batches (max 50 per run), fetch full messages not already processed, deliver to the trusted private queue, mark IDs as processed, and only then persist the page cursor. Failed delivery never marks messages processed. The module has no scheduled execution or production credentials and never modifies/sends Gmail messages.

To launch unattended collection requires server-side offline OAuth consent (and any applicable Gmail scope verification), encrypted refresh-token storage, authenticated recurring execution, durable job queues and action persistence, rate limiting, revocation and deletion controls, monitoring and closed-browser end-to-end tests. Google explicitly requires a server flow for offline Gmail access:
https://developers.google.com/workspace/gmail/api/auth/web-server

## Release gates and cost policy

Already testable: client appData snapshot listing/upload/format validation, private restore entry point, server worker API mocking, token omission from error messages, durable Gmail cursor/duplicate/failure paths and existing Chromium QA.

Still unverified: actual browser Drive API authorisation, Google Drive API enabled in the existing OAuth project, iPhone and desktop recovery, actual server-side offline authorisation, scheduled worker hosting, trusted credential database, action queue integration, background testing with the browser closed, full conflict-free sync.

Do not mark cross-device storage or background Gmail COMPLETE merely because the adapters pass mocked tests. Keep G04, G05, G10, G11 and G12 open. Secure deployment and any paid Netlify build/deploy require explicit permission after reviewing account usage, infrastructure and rollback. Production GitHub Pages is unchanged.
