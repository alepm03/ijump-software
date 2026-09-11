-- ============================================================
-- iJump — Treasury Sprint 2: daily cash close (cierre de caja)
-- Additive, reversible migration.
--
-- Business decision (Sprint 2 treasury, approved design): closing the till
-- is an expected-vs-counted reconciliation per payment method, done ONCE per
-- operational day. "Expected" is a snapshot taken at the moment of closing —
-- it is derived from payments (Σ payments.amount grouped by method for that
-- jornada) and then frozen forever in cash_close_lines.expected. It must
-- NEVER be recomputed after closing: if a payment is corrected/added later,
-- that is a real-world discrepancy the close should surface, not silently
-- absorb by re-deriving expected. Only `counted` (what the till physically
-- held) and `notes` are editable after closing (see updateCashClose).
--
-- Grain: cash_close is ONE header row per operational_day (UNIQUE
-- operational_day_id — enforces "a jornada is closed exactly once", and lets
-- closeCash rely on the UNIQUE constraint violation to detect "already
-- closed" instead of a separate existence check). cash_close_lines is
-- normalized (one row per payment method) rather than wide columns
-- (efectivo_expected, tarjeta_expected, ...) for the same reason Sprint 1's
-- channel_product_prices is normalized by channel: adding a payment method
-- in the future is a data change (new payment_method enum value + new rows),
-- not a DDL change. It also mirrors `payments`, which is already keyed by
-- the same payment_method enum — one shared vocabulary across the schema.
--
-- The discrepancy (counted − expected) is intentionally NOT a stored column:
-- it is arithmetic on two already-stored numbers, and storing it risks the
-- two going out of sync if either is updated independently. It is derived
-- in cash-close-engine.ts (buildCashCloseRows) exactly like
-- itemization-engine.ts derives fallbackToBasePrice rather than storing it.
--
-- closed_by is the Supabase auth user id (auth.uid()) of whoever closed the
-- till. No FK to auth.users: the rest of this schema never adds one either
-- (participants.created_by / reservation_groups.created_by are plain TEXT,
-- see 20260622000000_reservations.sql) since this is a single-admin-account
-- MVP (per CLAUDE.md) — a hard FK into the auth schema would be the first
-- of its kind here and buys no real integrity guarantee yet.
-- ============================================================

-- ============================================================
-- 1. cash_close — one header row per operational day (closed jornada)
-- ============================================================

CREATE TABLE cash_close (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_day_id  UUID NOT NULL UNIQUE REFERENCES operational_days(id) ON DELETE CASCADE,
  closed_at           TIMESTAMPTZ NOT NULL,
  closed_by           UUID NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_close_operational_day ON cash_close(operational_day_id);

CREATE TRIGGER set_cash_close_updated_at
  BEFORE UPDATE ON cash_close
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE cash_close ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON cash_close
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 2. cash_close_lines — one row per payment method, per cash_close
-- ============================================================
--
-- expected: snapshot at closing time, derived from payments — immutable
--   audit record. NEVER updated after insert (see updateCashClose, which
--   only touches `counted`/`notes`, and the "cabecera decisión" above).
-- counted: the only field a human types in — what the till physically held
--   for that method. Editable (till count corrections happen).

CREATE TABLE cash_close_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_close_id  UUID NOT NULL REFERENCES cash_close(id) ON DELETE CASCADE,
  method         payment_method NOT NULL,
  expected       NUMERIC(10, 2) NOT NULL,
  counted        NUMERIC(10, 2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cash_close_id, method)
);

CREATE INDEX idx_cash_close_lines_cash_close ON cash_close_lines(cash_close_id);

CREATE TRIGGER set_cash_close_lines_updated_at
  BEFORE UPDATE ON cash_close_lines
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE cash_close_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON cash_close_lines
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS cash_close_lines;
-- DROP TABLE IF EXISTS cash_close;
-- ============================================================
