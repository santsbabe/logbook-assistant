-- STAGED ONLY: apply after explicit private-database approval.
-- Rows remain encrypted, but RLS adds a second per-tenant boundary.
-- A restricted, non-owner, NOBYPASSRLS login role MUST be used by the service.
BEGIN;
REVOKE ALL ON control_centre_state,cc_gmail_credentials,cc_gmail_inbox,cc_gmail_processed,cc_gmail_cursor,cc_oauth_states FROM PUBLIC;
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
   'control_centre_state','cc_gmail_credentials','cc_gmail_inbox',
   'cc_gmail_processed','cc_gmail_cursor'
 ] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
   EXECUTE format('DROP POLICY IF EXISTS cc_isolated_tenant ON %I',table_name);
   EXECUTE format(
     'CREATE POLICY cc_isolated_tenant ON %I FOR ALL TO PUBLIC USING (tenant_id = current_setting(''cc.tenant_id'',true)) WITH CHECK (tenant_id = current_setting(''cc.tenant_id'',true))',table_name);
 END LOOP;
END $$;
-- OAuth callback receives opaque one-time state BEFORE knowing the tenant.
-- Never grant cc_oauth_states to browser-facing or tenant-scoped app roles.
-- Its consume API must use a narrowly privileged callback-only role.
COMMIT;
