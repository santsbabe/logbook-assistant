# Control Centre: real HTTP/PostgreSQL QA findings and non-deployment status

Date: 18 October 2026

## Evidence and resolved defect

The first live SQL integration attempt discovered that services/control-centre/postgres-state.cjs was incorrectly structured: INSERT ... SELECT guarded by expectedRevision=0 never entered its ON CONFLICT UPDATE branch when expectedRevision>0. Mocked database tests had missed this. The CAS SQL has been corrected to one atomic Common Table Expression containing a conditional update (existing revisions) and conditional insert (first revision), both guarded by expected revision.

An isolated PostgreSQL 16 service in GitHub Actions now executes the real migration, and a Node HTTP server exercises the actual private state API over loopback. The integration test creates temporary RSA-signed mock Google ID tokens, tests tenant-separated authenticated reads, 8 concurrent writes of the same first revision (exactly 1 success, 7 conflicts), valid subsequent revisions, an absent-tenant nonzero-revision rejection, SQL-injection-style title safety, encrypted-at-rest database content, rejection of tampered ciphertext, real Gmail encrypted queue/import/ack and durable OAuth one-time state.

The test never opens a connection to an external database: it asserts that the configured hostname is 127.0.0.1 and the database name is control_centre_ci. GitHub Actions creates an ephemeral PostgreSQL 16 service and installs the pg package in the runner with no package lock or long-lived database. This test and the baseline QA suite must **both** pass before any merge.

## Mobile conflict UX

In QA More, the staged private sync remains disabled, with a safe local conflict example. Conflicts retain keyboard focus after selection. For a future authorised live deployment, the UI enumerates local tasks removed, replaced or added and non-task data sections affected, explains possible data loss, and disables the submit action until the user explicitly checks an acknowledgement. Existing revision and local-backup safeguards remain. A headless real Chromium test at 390px verifies a demo decision, restored keyboard focus, no private HTTP calls and no change to local browser records.

This is **not** proof of touchscreen acceptance on the user's physical iPhone.

## Release configuration and rollback

- services/control-centre/ops/release.env.example contains placeholders only; no credentials.
- services/control-centre/ops/preflight.cjs is read-only and fail-closed. It does not contact Netlify or create resources. Its release gate requires an HTTPS host, approved frontend origin, Google OAuth audience, actual private Postgres, valid AES key, tenant pepper, rate limiter, confirmed backup restoration, rollback drill, privacy review, verified Netlify usage and explicit deployment permission.
- docs/control-centre/deployment-and-rollback-readiness.md details staged infrastructure, safe app rollback and manual reconciliation of post-backup data. No destructive SQL undo is auto-run.
- The schema is staged source; **no production database migrations have been applied**.

## Still NOT complete

No live private backend URL, database, Google OAuth verification, key management, real paid hosting budget, unattended Gmail schedule, iPhone-to-desktop synchronisation, device restore acceptance, or production deployment has been supplied or activated. Existing QA public HTML remains disabled with no real API endpoint. Netlify plan alone does not reveal available credits. Keep the relevant go-live gates open.

Test evidence: https://github.com/santsbabe/logbook-assistant/actions/workflows/control-centre-qa.yml
