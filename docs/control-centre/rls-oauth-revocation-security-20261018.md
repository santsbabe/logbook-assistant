# Control Centre — database permissions, Google consent and recovery hardening

18 October 2026. **STAGED AND TESTED, NOT DEPLOYED.**

## Database least privilege

Migration 002_tenant_rls.sql revokes PUBLIC table privileges and enables forced PostgreSQL row-level security on encrypted state and Gmail tenant data. Access policies compare tenant_id to the transaction-local cc.tenant_id setting. The setting must come solely from verified Google identity, never a caller's account selector.

The tenant-db.cjs module pins tenant identity inside a transaction, commits or rolls back, and returns connections safely. createTenantScopedStateStore applies this to the existing encrypted, revisioned application state.

Proposed role matrix:
- Migration owner: schema changes only; never handles web traffic.
- Web runtime role: SELECT/INSERT/UPDATE only on control_centre_state under forced RLS. NO access to Gmail credentials or OAuth one-time state.
- Gmail queue worker: minimal RLS-scoped inbox/processed/cursor privileges, with encrypted token vault via separate trusted privilege.
- OAuth callback: dedicated narrow privilege for opaque state consumption and encrypted credential writes.
- Scheduler: a separate verified list-enabled-accounts interface, not a bypass for arbitrary web traffic.

**Deployment gap:** The tenant-scoped state adapter is RLS-aware; the existing Gmail store and OAuth state lookup still need separate restricted-role production adapters. This RLS migration has not been deployed. Test-only PostgreSQL role is NOLOGIN/NOBYPASSRLS, and the real DB suite checks tenant isolation, cross-account SELECT/INSERT denials and inability to read credentials or consent state.

## OAuth callback and revocation

The staged Gmail routes require signed ID token + approved Origin to begin consent, exact Host and static HTTPS callback with one-time state and account matching. Callback HTML has no user data/tokens, sets no-store, no-referrer and CSP default-src none, and refuses repeated or malformed consent.

Disconnect disables polling locally FIRST, then calls Google's token revocation endpoint. A provider error leaves polling disabled and the refresh credential encrypted ONLY for a server-side retry; a successful revoke deletes the credential. The response clearly distinguishes local disable from confirmed Google revocation. The private revocation queue needs operational monitoring, deadlines, encrypted retention and an alert if retry continues to fail.

Google OAuth guidance: https://developers.google.com/identity/protocols/oauth2/web-server
Google best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices

## Integration evidence and remaining gaps

tests/control-centre-tenant-rls-oauth-http.cjs uses an actual disposable PostgreSQL 16 database, generated temporary RSA signing keys and local loopback HTTP, with mocked Google token exchange. It verifies forced RLS, real SQL role permissions, signed login, one-time callback, wrong account binding, local disable, failed provider revoke, later provider success and deletion.

NO live provider OAuth consent, phone-to-desktop sync, paid host, database migration, actual Netlify credit verification or production deployment has occurred. G04/G05/G09/G10/G12 still open. Details of published provider pricing and risk assumptions are in private-hosting-cost-comparison-20261018.md.

Netlify private account usage: https://app.netlify.com/teams/santsbabe (user's private browser; do not open with ChatGPT Cloud Browser).
