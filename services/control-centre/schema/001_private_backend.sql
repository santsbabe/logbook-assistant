-- Control Centre private backend schema. Staging migration only: NOT EXECUTED.
-- Apply using a restricted app role on a private PostgreSQL instance after approval.
-- NO household data, passwords, or Gmail access/refresh tokens belong in GitHub.
BEGIN;
CREATE TABLE IF NOT EXISTS control_centre_state(
 tenant_id text PRIMARY KEY CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 revision bigint NOT NULL CHECK (revision >= 1),
 encrypted_snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cc_gmail_credentials(
 tenant_id text PRIMARY KEY CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 encrypted_refresh jsonb NOT NULL,
 gmail_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cc_gmail_inbox(
 tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 message_key text NOT NULL,
 encrypted_envelope jsonb NOT NULL,
 enqueued_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,message_key)
);
CREATE TABLE IF NOT EXISTS cc_gmail_processed(
 tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 message_key text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,message_key)
);
CREATE TABLE IF NOT EXISTS cc_gmail_cursor(
 tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 cursor_key text NOT NULL,
 cursor_value text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,cursor_key)
);
-- OAuth CSRF state must be single-use and private; never trust caller account IDs.
CREATE TABLE IF NOT EXISTS cc_oauth_states(
 state_hash text PRIMARY KEY,
 tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-f0-9]{64}$'),
 encrypted_verifier jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_gmail_inbox_created_idx ON cc_gmail_inbox(tenant_id,enqueued_at);
CREATE INDEX IF NOT EXISTS cc_oauth_expiry_idx ON cc_oauth_states(expires_at);
COMMIT;
