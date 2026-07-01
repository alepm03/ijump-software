-- ============================================================
-- Finance v2 — validation harness (run on a Supabase BRANCH, never prod)
-- Sequence on the branch:
--   1) (migrations already applied incl. 20260618000000_finance_v2.sql)
--   2) run this SEED
--   3) run the ASSERTIONS and compare to the expected values
--
-- Synthetic scenario — operational day 2026-10-04, hand-computed P&L:
--   Revenue 925  |  Costs 460  |  EBITDA 465  (margin 50.27%)
-- Covers: items vs payments (COALESCE), SIN_DESGLOSE, NO_SHOW exclusion,
--         PER_FLIGHT / PER_JUMP / FIXED_PER_DAY, multi-jump instructor,
--         manual GENERALES expense.
-- ============================================================

-- ---- known rates (financial_settings on a fresh branch is 0/0/0, so set
--      the carried-over default_rate directly on the categories) ----
UPDATE expense_categories SET default_rate = 100 WHERE code = 'COMBUSTIBLE';     -- per flight
UPDATE expense_categories SET default_rate = 10  WHERE code = 'PLEGADOS';        -- per jump
UPDATE expense_categories SET default_rate = 50  WHERE code = 'TASAS_AERODROMO'; -- fixed per day

-- ---- instructors (fee 50/jump) ----
INSERT INTO instructors (id, name, fee_per_jump) VALUES
  ('bbbb0000-0000-0000-0000-000000000001', 'Inst Uno', 50),
  ('bbbb0000-0000-0000-0000-000000000002', 'Inst Dos', 50);

-- ---- operational day + 2 flights ----
INSERT INTO operational_days (id, date) VALUES
  ('aaaa0000-0000-0000-0000-000000000001', DATE '2026-10-04');
INSERT INTO flights (id, operational_day_id, flight_number, order_index) VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 1, 1),
  ('cccc0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 2, 2);

-- ---- participants ----
-- P1, P2 completed with items; P3 completed without items (historical);
-- P4 NO_SHOW with a deposit and an assigned instructor (must NOT count as a jump).
INSERT INTO participants (id, flight_id, assigned_instructor_id, full_name, operational_status) VALUES
  ('dddd0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'P1', 'COMPLETED'),
  ('dddd0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002', 'P2', 'COMPLETED'),
  ('dddd0000-0000-0000-0000-000000000003', 'cccc0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000001', 'P3', 'COMPLETED'),
  ('dddd0000-0000-0000-0000-000000000004', 'cccc0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000001', 'P4', 'NO_SHOW');

-- ---- payments (what was collected) ----
INSERT INTO payments (participant_id, amount, method, stage) VALUES
  ('dddd0000-0000-0000-0000-000000000001', 60,  'TARJETA',  'RESERVA'),
  ('dddd0000-0000-0000-0000-000000000001', 215, 'EFECTIVO', 'LIQUIDACION'),
  ('dddd0000-0000-0000-0000-000000000002', 60,  'TARJETA',  'RESERVA'),
  ('dddd0000-0000-0000-0000-000000000002', 330, 'EFECTIVO', 'LIQUIDACION'),
  ('dddd0000-0000-0000-0000-000000000003', 200, 'EFECTIVO', 'LIQUIDACION'),
  ('dddd0000-0000-0000-0000-000000000004', 60,  'TARJETA',  'RESERVA');

-- ---- participant_items (what was sold) — only P1 and P2 ----
INSERT INTO participant_items (participant_id, product_id, quantity, unit_price)
SELECT 'dddd0000-0000-0000-0000-000000000001', id, 1, 215 FROM products WHERE code = 'TANDEM_BASE'
UNION ALL SELECT 'dddd0000-0000-0000-0000-000000000001', id, 1, 60  FROM products WHERE code = 'HANDYCAM'
UNION ALL SELECT 'dddd0000-0000-0000-0000-000000000002', id, 1, 215 FROM products WHERE code = 'TANDEM_BASE'
UNION ALL SELECT 'dddd0000-0000-0000-0000-000000000002', id, 1, 175 FROM products WHERE code = 'VIDEO_EXT';

-- ---- one manual GENERALES expense on the day ----
INSERT INTO expenses (expense_category_id, operational_day_id, incurred_on, description, amount)
SELECT id, 'aaaa0000-0000-0000-0000-000000000001', DATE '2026-10-04', 'Varios', 30
FROM expense_categories WHERE code = 'GENERALES';

-- ============================================================
-- ASSERTIONS  (compare output to the expected comments)
-- ============================================================

-- A) Revenue total via COALESCE(items, payments)  -> EXPECT 925
WITH part AS (
  SELECT p.id,
    (SELECT COUNT(*)            FROM participant_items pi WHERE pi.participant_id = p.id) AS n_items,
    (SELECT COALESCE(SUM(pi.amount),0) FROM participant_items pi WHERE pi.participant_id = p.id) AS items_sum,
    (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay WHERE pay.participant_id = p.id) AS pay_sum
  FROM participants p
  JOIN flights f ON f.id = p.flight_id
  JOIN operational_days od ON od.id = f.operational_day_id
  WHERE od.date = DATE '2026-10-04'
)
SELECT 'revenue_total' AS metric, SUM(CASE WHEN n_items > 0 THEN items_sum ELSE pay_sum END) AS value FROM part;

-- B) Revenue by product category  -> EXPECT TANDEM_BASE 430, CAMERA_HANDYCAM 60, CAMERA_EXTERNAL 175
SELECT pr.category::text AS metric, SUM(pi.amount) AS value
FROM participant_items pi
JOIN products pr ON pr.id = pi.product_id
JOIN participants p ON p.id = pi.participant_id
JOIN flights f ON f.id = p.flight_id
JOIN operational_days od ON od.id = f.operational_day_id
WHERE od.date = DATE '2026-10-04'
GROUP BY pr.category ORDER BY 1;

-- C) SIN_DESGLOSE (payments of participants without items)  -> EXPECT 260
SELECT 'SIN_DESGLOSE' AS metric, COALESCE(SUM(pay.amount),0) AS value
FROM payments pay
JOIN participants p ON p.id = pay.participant_id
JOIN flights f ON f.id = p.flight_id
JOIN operational_days od ON od.id = f.operational_day_id
WHERE od.date = DATE '2026-10-04'
  AND NOT EXISTS (SELECT 1 FROM participant_items pi WHERE pi.participant_id = p.id);

-- D) Flights & completed jumps  -> EXPECT flights 2, completed 3
SELECT 'flights' AS metric,
  (SELECT COUNT(*) FROM flights f JOIN operational_days od ON od.id = f.operational_day_id WHERE od.date = DATE '2026-10-04') AS value
UNION ALL
SELECT 'completed_jumps',
  (SELECT COUNT(*) FROM participants p JOIN flights f ON f.id = p.flight_id JOIN operational_days od ON od.id = f.operational_day_id
   WHERE od.date = DATE '2026-10-04' AND p.operational_status NOT IN ('CANCELLED','NO_SHOW','WEATHER_CANCELLED'));

-- E) Instructor cost (fee * completed jumps, per instructor)  -> EXPECT 150  (I1: 2 jumps, I2: 1 jump)
SELECT 'instructor_cost' AS metric, COALESCE(SUM(j * fee),0) AS value FROM (
  SELECT p.assigned_instructor_id, COUNT(*) AS j, MAX(i.fee_per_jump) AS fee
  FROM participants p
  JOIN flights f ON f.id = p.flight_id
  JOIN operational_days od ON od.id = f.operational_day_id
  JOIN instructors i ON i.id = p.assigned_instructor_id
  WHERE od.date = DATE '2026-10-04' AND p.operational_status NOT IN ('CANCELLED','NO_SHOW','WEATHER_CANCELLED')
  GROUP BY p.assigned_instructor_id
) t;

-- Expected cost assembly (no overrides; rates set above):
--   COMBUSTIBLE  100 * 2 flights = 200
--   TASAS_AERODROMO fixed/day    =  50
--   PLEGADOS     10 * 3 jumps    =  30
--   INSTRUCTORES (E)             = 150
--   GENERALES    manual          =  30
--   VUELOS/EQUIPOS/EDICION/COMISION_GROUPON = 0
--   costs_total = 460  ->  EBITDA = 925 - 460 = 465
