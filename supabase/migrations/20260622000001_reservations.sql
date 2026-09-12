-- ============================================================
-- Reservations module (Leads -> Manifest)
-- Additive and reversible. See docs/reservas/RESERVAS_MODULE_PLAN_v1.md
--
-- Core idea: a "lead" is simply a participant row with flight_id IS NULL
-- plus a lead_status. No separate leads table, no data migration on confirm.
-- TEXT + CHECK is used instead of Postgres enums because ALTER TYPE ADD VALUE
-- is not reversible (see waiver_documents migration for the same pattern).
-- ============================================================

-- 1. participants — lead lifecycle fields
ALTER TABLE participants
  ADD COLUMN lead_status     TEXT,
  ADD COLUMN preferred_date  DATE,
  ADD COLUMN preferred_time  TIME,
  ADD COLUMN confirmed_date  DATE,
  ADD COLUMN confirmed_time  TIME,
  ADD COLUMN deposit_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN channel         TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by      TEXT,
  ADD COLUMN token           UUID DEFAULT gen_random_uuid();

ALTER TABLE participants
  ADD CONSTRAINT participants_lead_status_check
    CHECK (lead_status IS NULL OR lead_status IN
      ('NEW', 'TENTATIVE', 'CONFIRMED', 'RESCHEDULE_NEEDED', 'CANCELLED', 'NO_SHOW')),
  ADD CONSTRAINT participants_channel_check
    CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF')),
  ADD CONSTRAINT participants_token_unique
    UNIQUE (token);

CREATE INDEX idx_participants_lead_status    ON participants(lead_status)    WHERE lead_status IS NOT NULL;
CREATE INDEX idx_participants_preferred_date ON participants(preferred_date) WHERE preferred_date IS NOT NULL;
CREATE INDEX idx_participants_confirmed_date ON participants(confirmed_date) WHERE confirmed_date IS NOT NULL;

-- 2. reservation_groups — reused for grouping leads (couples/families), no new table
ALTER TABLE reservation_groups
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN channel       TEXT NOT NULL DEFAULT 'STAFF',
  ADD COLUMN created_by    TEXT;

ALTER TABLE reservation_groups
  ADD CONSTRAINT reservation_groups_channel_check
    CHECK (channel IN ('WEB_BOT', 'WHATSAPP_BOT', 'STAFF'));

-- 3. api_keys — bot authentication (hash only, never plaintext)
CREATE TABLE api_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label              TEXT NOT NULL,
  key_hash           TEXT NOT NULL UNIQUE,
  key_prefix         TEXT NOT NULL,
  scopes             TEXT[] NOT NULL DEFAULT ARRAY['reservations:write', 'availability:read', 'status:read'],
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at         TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE active = TRUE;

-- 4. api_rate_limits — fixed-window counter, no Redis dependency
CREATE TABLE api_rate_limits (
  api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

-- 5. business_settings — configurable business parameters, never hardcode capacity
CREATE TABLE business_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_settings (key, value, description) VALUES
  ('max_flights_per_day',       '10',    'Max flights per operational day — CONFIRM with Raul'),
  ('max_clients_per_flight',    '2',     'Tandem capacity per flight'),
  ('operating_weekdays',        '6,0',   '6=Sat, 0=Sun (JS Date.getUTCDay). CONFIRM if weekdays also operate'),
  ('default_first_flight_time', '09:00', 'Time of the first flight of a newly created day');

-- 6. RLS — same posture as the rest of the app for app-facing tables.
--    api_keys (write) and api_rate_limits have NO authenticated policy:
--    they are secrets/internal state, touched only by the service client.
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON business_settings
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated can read api_keys" ON api_keys
  FOR SELECT TO authenticated USING (TRUE);

-- ============================================================
-- ROLLBACK (manual, run by hand if this migration needs to be reverted).
-- Nothing pre-existing is touched destructively.
-- ============================================================
-- DROP TABLE IF EXISTS api_rate_limits;
-- DROP TABLE IF EXISTS api_keys;
-- DROP TABLE IF EXISTS business_settings;
--
-- ALTER TABLE reservation_groups
--   DROP CONSTRAINT IF EXISTS reservation_groups_channel_check,
--   DROP COLUMN IF EXISTS contact_phone,
--   DROP COLUMN IF EXISTS contact_email,
--   DROP COLUMN IF EXISTS channel,
--   DROP COLUMN IF EXISTS created_by;
--
-- ALTER TABLE participants
--   DROP CONSTRAINT IF EXISTS participants_lead_status_check,
--   DROP CONSTRAINT IF EXISTS participants_channel_check,
--   DROP CONSTRAINT IF EXISTS participants_token_unique,
--   DROP COLUMN IF EXISTS lead_status,
--   DROP COLUMN IF EXISTS preferred_date,
--   DROP COLUMN IF EXISTS preferred_time,
--   DROP COLUMN IF EXISTS confirmed_date,
--   DROP COLUMN IF EXISTS confirmed_time,
--   DROP COLUMN IF EXISTS deposit_paid,
--   DROP COLUMN IF EXISTS channel,
--   DROP COLUMN IF EXISTS created_by,
--   DROP COLUMN IF EXISTS token;
-- ============================================================
