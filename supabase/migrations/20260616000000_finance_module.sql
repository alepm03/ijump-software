-- ============================================================
-- iJump — Finance Module
-- ============================================================

-- ============================================================
-- 1. Extend instructors with fee per jump
-- ============================================================

ALTER TABLE instructors
  ADD COLUMN fee_per_jump DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Global financial settings (single-row table)
-- ============================================================

CREATE TABLE financial_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_price_per_flight DECIMAL(10, 2) NOT NULL DEFAULT 0,
  hangar_price_per_day  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  packer_fee_per_jump   DECIMAL(10, 2) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with one row so there's always a config to read
INSERT INTO financial_settings (fuel_price_per_flight, hangar_price_per_day, packer_fee_per_jump)
VALUES (0, 0, 0);

-- ============================================================
-- 3. Day expenses (overrides + free-form entries per day)
-- ============================================================

CREATE TYPE expense_type AS ENUM ('FUEL_OVERRIDE', 'HANGAR_OVERRIDE', 'CUSTOM');

CREATE TABLE day_expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_day_id   UUID NOT NULL REFERENCES operational_days(id) ON DELETE CASCADE,
  type                 expense_type NOT NULL,
  description          TEXT,           -- required for CUSTOM, optional for overrides
  amount               DECIMAL(10, 2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_day_expenses_day ON day_expenses(operational_day_id);

-- ============================================================
-- 4. RLS Policies
-- ============================================================

ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_expenses        ENABLE ROW LEVEL SECURITY;

-- financial_settings: authenticated users can read and update (single admin)
CREATE POLICY "financial_settings_select" ON financial_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "financial_settings_update" ON financial_settings
  FOR UPDATE TO authenticated USING (true);

-- day_expenses: authenticated users full access
CREATE POLICY "day_expenses_select" ON day_expenses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "day_expenses_insert" ON day_expenses
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "day_expenses_update" ON day_expenses
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "day_expenses_delete" ON day_expenses
  FOR DELETE TO authenticated USING (true);
