-- ============================================================
-- iJump — Treasury Sprint 1: channel net pricing + auto-itemization flag
-- Additive, reversible migration.
--
-- Business decision closed 2026-07-01 (see docs/act-as-como-mi-co-ceo-co-cto-
-- reactive-kite.md §Decisiones cerradas): platform price = iJump's own net
-- sale price, commission is NEVER registered. The client pays the platform
-- (Groupon/Smartbox/...) and redeems a voucher; the platform pays iJump an
-- agreed NET amount per product, which is what participant_items.unit_price
-- must snapshot. sale_channels.commission_pct remains purely informational
-- (already documented as such in 20260629000000_finance_raul_data.sql) and
-- is NOT read by this new pricing path.
--
-- ============================================================
-- 1. channel_product_prices — channel × product → net price matrix
-- ============================================================
--
-- Keying decision: reservation_groups.source is the native Postgres enum
-- `reservation_source` (DIRECT | GROUPON | BONO | PROMO | SMARTBOX) — see
-- 20260525000000_initial_schema.sql:41-47. That is exactly the channel value
-- captured on every participant via their reservation_group, and exactly
-- what the auto-itemization code path has in hand when resolving a price
-- (participant -> reservation_group -> source).
--
-- sale_channels.code (TEXT) was considered as the FK target instead, since
-- it is the "channel registry" table. It was NOT used here because:
--   a) sale_channels has 3 extra rows (WONDERBOX, JUMPING, FREEDOM) with NO
--      corresponding reservation_source value yet — the reservations module
--      cannot produce that channel on a participant today, so a price row
--      for them would be unreachable dead data until the enum is extended.
--   b) sale_channels is keyed by a free-text `code`, which would make this
--      table's FK a soft/text reference instead of a real FK constraint —
--      losing referential integrity for no benefit today.
--   c) reservation_source already IS the FK-able, enum-constrained identity
--      of "channel a participant was sold through" — reusing it keeps a
--      single source of truth and gives us a real foreign-key-like CHECK.
-- Net effect: this table's grain is (reservation_source, product_id), not
-- (sale_channels.id, product_id). When reservation_source gains WONDERBOX/
-- JUMPING/FREEDOM in a future reservations migration, add matching rows
-- here in the same migration that extends the enum.
--
-- unit_price is the NET amount iJump receives for that product when sold
-- through that channel (DIRECT = catalog price; platform = agreed net).
-- active lets a channel+product combination be paused without deleting the
-- historical row (auto-itemization falls back to products.base_price with
-- a traceable note when no active price row exists for a channel+product).

CREATE TABLE channel_product_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     reservation_source NOT NULL,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_price  NUMERIC(10, 2) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, product_id)
);

CREATE INDEX idx_channel_product_prices_channel ON channel_product_prices(channel);
CREATE INDEX idx_channel_product_prices_product ON channel_product_prices(product_id);

CREATE TRIGGER set_channel_product_prices_updated_at
  BEFORE UPDATE ON channel_product_prices
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE channel_product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON channel_product_prices
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Seed: DIRECT channel prices mirror products.base_price (catalog price).
-- Platform rows (GROUPON, SMARTBOX, BONO, PROMO) are intentionally NOT
-- seeded — real net prices are pending from Raúl (see docs/act-as-como-mi-
-- co-ceo-co-cto-reactive-kite.md §Datos pendientes). Until a channel+product
-- row exists, auto-itemization falls back to base_price (see application
-- code) so nothing breaks; add the real rows here or via the admin UI once
-- confirmed, no migration needed for that (channel_product_prices is a plain
-- config table editable at runtime).
INSERT INTO channel_product_prices (channel, product_id, unit_price, notes)
SELECT 'DIRECT'::reservation_source, id, base_price, 'Seed inicial desde products.base_price'
FROM products;

-- ============================================================
-- 2. participant_items.auto_generated — distinguishes items created by the
--    packageType -> products auto-itemization engine from items added by
--    hand in the manifest (e.g. OVERWEIGHT supplement). Needed so a
--    packageType change can re-sync the automatic lines without touching
--    manual additions, and so cancellation flows can safely delete only
--    the automatic lines.
-- ============================================================

ALTER TABLE participant_items
  ADD COLUMN auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_participant_items_auto_generated
  ON participant_items(participant_id, auto_generated);

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- ------------------------------------------------------------
-- DROP INDEX IF EXISTS idx_participant_items_auto_generated;
-- ALTER TABLE participant_items DROP COLUMN IF EXISTS auto_generated;
-- DROP TABLE IF EXISTS channel_product_prices;
-- ============================================================
