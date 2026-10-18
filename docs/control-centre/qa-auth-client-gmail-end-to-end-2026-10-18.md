# Control Centre QA — authenticated frontend, conflict decisions and Gmail-to-Review tests

Status: 18 October 2026. **QA source only. Backend remains DISABLED.** Do not infer a live private API, database, cross-device synchronisation or unattended Gmail.

## Implemented in this package

- The independent browser client in familyroy-control-centre-qa/authenticated-sync.js accepts only an explicitly enabled, preapproved private HTTPS API. There is no configurable arbitrary endpoint in the UI. Tokens exist only in memory and are sent as Authorization Bearer over HTTPS with cache and redirect protections.
- backend-config.js is hard-coded enabled:false / endpoint:null. No real Google sign-in is attempted by the QA app while it is disabled. The More panel offers a clear, interactive example with **no real device or server data changed**.
- In an approved future deployment, the client accepts a Google Identity Services credential (a signed Google ID token, not a Gmail access token), reads a revisioned state and displays conflicts between this device and the private server.
- The three-way reconciliation engine retains independent changes, refuses duplicate IDs, and makes ambiguous task changes/deletions and non-task section clashes explicit decisions. User must choose **Keep this device** or **Keep cloud version** per conflict.
- New writes always re-fetch the latest server revision, refuse to proceed if device data changed during review, initiate a local backup, and submit a single atomic compare-and-swap write. A newer remote revision or HTTP 409 restarts review without overwriting anything. If remote persistence succeeds but local storage fails, the UI says so; it does not falsely report complete sync.
- The staged Gmail-to-Review importer in services/control-centre/gmail-review.cjs creates a source-linked Review item with no assumed owner, child or deadline. Queue items are acknowledged **only after** the encrypted canonical task state is committed, or the task already exists.
- PostgreSQL queue support adds unread listing, a validated per-tenant acknowledgement and reviewed_at. SQL schema in services/control-centre/schema/001_private_backend.sql is **not executed**.

## Evidence: fully mocked local pipeline

The test tests/control-centre-gmail-end-to-end.cjs runs the real staged modules together with a fake transactional PostgreSQL adapter and fake Gmail HTTPS transport:
Google refresh token -> private encrypted Gmail inbox -> idempotent polling cursor -> encrypted Control Centre Review tasks -> queue acknowledgement.

It tests account isolation, duplicate messages, concurrent CAS retries, failure after write/before acknowledgement, repeated reconciliation without duplicate tasks, permanent database conflict leaving mail unacknowledged and refresh-token revocation. No live messages are read.

The authenticated client tests check token transport, strict HTTPS endpoint, disabled feature flag, initial device merge, independent task edits, conflicting edits/deletions, per-record choices, stale-server revisions, 409 races, local device mutation while reviewing, and partial local persistence.

Chromium smoke tests also assert that the QA More panel renders the disabled backend status and the **Try a conflict example** control at desktop and phone-width sizes. Real Safari/iPhone acceptance remains outstanding.

## Security and cost verification

- Netlify connector: team **santsbabe**, Free tier; seven existing Netlify sites returned. This Control Centre backend is NOT one of those provisioned Netlify projects. No new site, deployment, function, database or environment variable was created.
- The available Netlify connector tools list projects and plan but do **not** expose a live credit balance, build usage or invoice/overage cost. Current credits and the exact cost of hosting a private Node/PostgreSQL runtime are **not verified**. Source for user-side private verification: https://app.netlify.com/teams/santsbabe
- The code requires a private HTTPS host, authorised OAuth web-client origin, separate Google Identity and Gmail offline OAuth flows, secure secret/key vault, restricted PostgreSQL role, rate limiter, rotation and revocation policy, domain and TLS setup, encrypted backup/restore, mailbox-retention policy, deployment monitoring, and a scheduler approved for its expected cost.
- Official Google Identity and OAuth documentation must be checked again against the actual deployed OAuth project. The current browser Gmail OAuth access token is not an unattended server refresh token.
- Missing: database provision, actual state/API end-to-end with Google credentials, true two-device sync, iPhone Safari tests, server cron and alerts, and Netlify credit verification. G04/G05/G09/G10/G11/G12 remain open.
- No production Control Centre app file has been changed by this package. Netlify deployment and all paid services require the user's explicit permission.

## Next permitted autonomous work package

Continue hardening QA screen-level input and restore paths, add an authenticated server route wrapper and locally executable fixture/server for true HTTP tests, document confidential-data access controls, and prepare a proposed monthly and worst-case credit envelope using account screenshots or a read-only usage API. Do not assume that running GitHub tests proves Google OAuth or a database has been provisioned.
