# Control Centre private backend — deployment and rollback readiness

**Not deployed. No Netlify build, database or paid infrastructure has been provisioned.** This is a staged operational plan; no permission to spend is implied.

## Controlled deployment (future, permission-gated)

1. **Budget and provider:** Inspect actual credit balances and historic functions/build usage at https://app.netlify.com/teams/santsbabe . Available read-only connector results show a Free team and seven existing sites, not credits or expected hosting costs. Price the private HTTP host, PostgreSQL, backups, scheduled Gmail, bandwidth and rate limiter with current provider quotes, and set a monthly ceiling. Seek explicit permission before any deployment.
2. **Private PostgreSQL:** Choose a private encrypted and TLS-protected host, separate app and migration roles, restricted network access, a verified automated backup/restore service, and key management. Add RLS or equivalent database-level tenancy controls before external exposure. Current staged code scopes tenant IDs in application queries, but is not audited as DB-level RLS.
3. **Secrets and identity:** Keep Google OAuth web-client, Gmail offline OAuth secret, encryption keys, HMAC tenant pepper and database URL in a dedicated secret manager. No browser, GitHub source, Netlify logs or spreadsheet may contain real credentials. Review rotation, recovery and revocation.
4. **Network/API:** Terminate at a dedicated HTTPS origin, restrict the frontend origin to https://santsbabe.github.io , install a durable rate limiter, restrict payload sizes, audit error logs for sensitive details and verify account separation.
5. **Mailbox worker:** Configure a server-side OAuth callback using single-use state and PKCE, a private scheduler, exclusive account processing leases and an encrypted Gmail Review queue. Test revocation, replay and browser-closed processing.
6. **Frontend:** Keep backend-config.js disabled until both devices pass consent, conflict and recovery acceptance. A future QA activation needs an approved host and explicit release decision; production requires a separate release.
7. **Acceptance:** Real HTTP/PostgreSQL concurrency, CI Chromium, real iPhone Safari, two-device simultaneous edits, read-only audit, backup and restore, and background mail processing with browser closed.

## Read-only preflight

Use the provider-neutral command:

    node services/control-centre/ops/preflight.cjs

A future privately configured approved runtime may use the --release flag to refuse incomplete credentials, backup drills and budget signoffs. This script **never** deploys, contacts Netlify, creates resources or applies migrations. The accompanying release.env.example is placeholders only. Never commit values into that file.

## Safe rollback: no destructive automation

**Before release:** stop scheduled mail work, record the last passing revision and database schema revision, export an encrypted backup, and restore it to a clean STAGING database. Confirm Gmail inbox cursors and queues are recoverable, and obtain a signed-off rollback window.

**If the release fails:** (1) set QA feature flag to disabled; (2) stop private API ingress and background schedule; (3) revert application binary/config to last known-good version; (4) preserve live encrypted database and any writes accepted after the last backup; (5) restore backup only to an isolated environment and compare state revisions and queued mails; (6) reconcile post-backup data by an authorised operator before any production restore; (7) verify existing browser-only and private Drive snapshots remain accessible; (8) test one allowed account and one blocked account; (9) leave all features off until QA passes.

**Do not DROP tables or automatically restore an old snapshot over household changes.** This schema migration is additive. An irreversible data restore demands its own explicit permission and a verified point-in-time plan.

## Evidence limits

Automated QA proves the staged code, including local ephemeral PostgreSQL and HTTP, but does **not** demonstrate a provisioned private production backend, real Google OAuth, a scheduled service, working iPhone ↔ desktop sync, Netlify credit availability, a production security assessment or a device rollback drill. Keep those release gates open.
