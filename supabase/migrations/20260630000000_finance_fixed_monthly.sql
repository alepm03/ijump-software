-- ============================================================
-- iJump — Finance: monthly fixed-cost rate basis (FIXED_PER_MONTH)
-- Additive, reversible migration.
--
-- Problem it fixes:
--   The P&L engine accumulates category cost per operational day and
--   sums across days. With rate_basis = FIXED_PER_DAY a "monthly" cost
--   (aerodrome bundle, plane loan, insurance, software) was charged
--   ONCE PER OPERATIONAL DAY, so a month with 5 days billed the 1040 €
--   bundle as 5 × 1040 = 5200 €. That is wrong: these are monthly costs,
--   not per-day costs.
--
-- Fix:
--   1. Convert `rate_basis` from a Postgres ENUM to TEXT + CHECK so new
--      values can be added reversibly (ALTER TYPE ADD VALUE is NOT
--      reversible — same reasoning the v2.1 session applied to group_type).
--   2. Add the new value FIXED_PER_MONTH.
--   3. Reclassify the four monthly fixed costs to FIXED_PER_MONTH:
--        TASAS_AERODROMO, SWOOPWARE, CUOTA_PRESTAMO_AVION, SEGURO_AVION
--
--   The engine (pnl-engine.ts) applies FIXED_PER_MONTH once per distinct
--   calendar month in the period (month view = ×1; day/week view = ×0;
--   year view = ×months-in-range). See docs/FINANCE_MODEL_V2.md §5.
--
-- ROLLBACK: see commented block at the end of this file.
-- ============================================================

-- ============================================================
-- 1. Convert rate_basis ENUM → TEXT (so we can add values reversibly)
-- ============================================================

ALTER TABLE expense_categories
  ALTER COLUMN rate_basis TYPE TEXT USING rate_basis::TEXT;

-- Drop the now-unused enum type (only used by this one column).
DROP TYPE IF EXISTS rate_basis;

-- ============================================================
-- 2. Add CHECK constraint including the new FIXED_PER_MONTH value
--    (NULL stays allowed: GENERALES catch-all categories have no basis.)
-- ============================================================

ALTER TABLE expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_rate_basis_check;

ALTER TABLE expense_categories
  ADD CONSTRAINT expense_categories_rate_basis_check
  CHECK (rate_basis IN ('PER_FLIGHT', 'PER_JUMP', 'FIXED_PER_DAY', 'FIXED_PER_MONTH'));

-- ============================================================
-- 3. Reclassify monthly fixed costs to FIXED_PER_MONTH
-- ============================================================

UPDATE expense_categories
  SET rate_basis = 'FIXED_PER_MONTH'
  WHERE code IN ('TASAS_AERODROMO', 'SWOOPWARE', 'CUOTA_PRESTAMO_AVION', 'SEGURO_AVION');

-- ============================================================
-- 4. Archive the obsolete VUELOS category (confirmed by Raúl)
--    "Coste por vuelo" used to be plane rental. The plane is now owned:
--    its cost is the 150.000 € / 7-year loan (CUOTA_PRESTAMO_AVION, monthly,
--    interest included, visible in the annual view ×12), and fuel is already
--    its own category (COMBUSTIBLE). VUELOS no longer has a meaning and would
--    only risk double-counting fuel — archive it (active = false, not deleted).
-- ============================================================

UPDATE expense_categories
  SET active = false
  WHERE code = 'VUELOS';

-- ============================================================
-- ROLLBACK (run manually to fully revert this migration).
-- ------------------------------------------------------------
-- -- Re-activate VUELOS.
-- UPDATE expense_categories SET active = true WHERE code = 'VUELOS';
--
-- -- Revert the four categories away from FIXED_PER_MONTH first,
-- -- otherwise re-creating the stricter enum would fail.
-- UPDATE expense_categories SET rate_basis = 'FIXED_PER_DAY'
--   WHERE code = 'TASAS_AERODROMO';
-- UPDATE expense_categories SET rate_basis = 'FIXED_PER_DAY'
--   WHERE code IN ('SWOOPWARE', 'CUOTA_PRESTAMO_AVION', 'SEGURO_AVION');
--
-- ALTER TABLE expense_categories
--   DROP CONSTRAINT IF EXISTS expense_categories_rate_basis_check;
--
-- CREATE TYPE rate_basis AS ENUM ('PER_FLIGHT', 'PER_JUMP', 'FIXED_PER_DAY');
--
-- ALTER TABLE expense_categories
--   ALTER COLUMN rate_basis TYPE rate_basis USING rate_basis::rate_basis;
-- ============================================================
