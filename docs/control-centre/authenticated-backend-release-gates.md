# Control Centre — authenticated backend: delivery and release gates

STATUS: implementation and automated tests only. NOT provisioned, NOT deployed, NOT connected to production household records. No Netlify deployment was initiated.

## Identity and private API

The Google identity module verifies an actual signed ID token against Google's public signing keys, supported issuer, configured audience, timestamp and signature. It does not trust a Gmail access token, email address or caller-controlled account header as identity. A secret server-side HMAC derives an opaque, per-account tenant key from Google's authenticated subject.

The HTTP boundary offers GET and PUT /v1/state, explicitly checks allowed frontend origins, sets no-store headers, requires a private rate limiter and rejects oversized or invalid JSON. All calls derive the tenant from a verified Google ID token. There is no publicly reachable backend endpoint yet.

The PostgreSQL adapter stores app-level AES-256-GCM ciphertext with tenant and revision bound as authenticated associated data. A single conditional PostgreSQL UPSERT guarantees atomic compare-and-swap; a stale client receives HTTP 409 and must re-fetch rather than overwriting another device's state. The schema migration file in services/control-centre/schema/001_private_backend.sql has not been executed anywhere.

## Cross-device conflicts

services/control-centre/conflict-merge.cjs produces a candidate only if base/local/remote changes are unambiguous. Changes to separate tasks are preserved. Concurrent edits to the same task, conflicting new IDs, deletions and divergent edits to non-task sections (shopping, history, electricity and so on) are surfaced as conflicts without choosing a winner. Invalid states and duplicate task IDs stop the merge. A candidate must still be written with a new compare-and-swap operation and retried on further 409 responses. The real-device conflict resolution UI and authenticated session have not been implemented.

## Gmail private worker and OAuth

The offline Gmail onboarding implementation uses one-time, durable CSRF state, PKCE, Google ID token account matching and limited Gmail read-only scope. Private database tables hold only app-encrypted refresh tokens and queue content. The host-independent scheduler module refreshes access tokens just in time, uses server-owned enabled-account lists and requires a durable exclusive PostgreSQL lease. The Gmail worker retains per-user processed IDs, an encrypted idempotent inbox and cursor updates only after successful delivery. It cannot run with the browser closed until an approved private hosting and scheduled execution environment exists.

A downstream classification queue consumer is also required to translate reviewed email evidence into canonical Control Centre actions. No Gmail messages have been fetched by this new backend and no refresh token was provisioned.

## Launch dependencies

1. Select and approve the private Node backend and restricted PostgreSQL service, encryption-key source, key-rotation plan, HTTPS host and rate limiter. Execute the SQL schema only after authorisation.
2. Configure and verify Google's server-side OAuth client, authorised HTTPS callback, required Google APIs/scopes, domain permissions and any applicable verification. Expose authenticated OAuth start and callback routes based on the staged helpers.
3. Implement authenticated frontend sign-in, versioned state transfer, task-by-task conflict decisions, and device backup/rollback.
4. Implement encrypted refresh-token rotation/revocation, mailbox queue classifier, tenant-specific delete/retention, distributed lease timeout policy, alerting and quotas.
5. Test two devices concurrently, Gmail with the browser closed, consent revocation, refresh failure, backups and full rollback.
6. Inspect Netlify usage and expected infrastructure cost. Obtain the user's explicit permission before deploying anything to Netlify. GitHub Pages cannot host private Node functions.
7. Complete the Control Centre master go-live gates before production promotion.

## Test scope and limitations

tests/control-centre-private-backend.cjs exercises real cryptographic JWT validation with temporary RSA test keys, signed-user isolation, wrong audience/issuer/expiry, concurrent encrypted state writes, strict cross-origin checks, conservative conflict resolution, encrypted per-account Gmail queues, durable cursor and idempotency contracts, token encryption and revocation, lease cleanup, Gmail token refresh, one-time OAuth state and cross-account rejection. Existing JavaScript and Chromium QA tests remain in the workflow.

A green CI run verifies these modules in simulated, isolated conditions. It does NOT establish a live authenticated backend, an operational scheduler, a completed Google OAuth integration, production readiness, or live cross-device sync.
