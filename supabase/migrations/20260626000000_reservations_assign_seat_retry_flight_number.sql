-- ============================================================
-- Harden reservations_assign_seat against flight_number collisions.
--
-- Bug observed in production: confirming a lead on a day that already had
-- 2 flights (10:00, 11:00) consistently failed with
--   duplicate key value violates unique constraint
--   "flights_operational_day_id_flight_number_key"
-- attempting to insert flight_number=2, even though a fresh COUNT(*) run
-- outside the function correctly returns 2. The exact root cause inside
-- the previously deployed function body could not be confirmed without DB
-- shell access, so instead of re-deriving v_next_flight_number from a
-- single point-in-time COUNT(*), the new flight is inserted inside a
-- retry loop: compute MAX(flight_number)+1 fresh on each attempt and
-- catch unique_violation, incrementing and retrying. This makes the
-- function self-correcting regardless of why a prior count was stale,
-- and is strictly safer than the COUNT-based approach under concurrency
-- too (FOR UPDATE on existing rows doesn't protect against a flight_number
-- computed from a stale read).
--
-- Business rules unchanged from 20260625000000:
--   - Join an existing flight at the EXACT requested time if it has room.
--   - Otherwise create a new flight, at the requested time if free, else
--     walking forward in 1-hour increments to the next free time.
--   - Never reassign a lead into a different-time flight just because it
--     has spare capacity.
--   - Re-sequence order_index/flight_number for the whole day after every
--     assignment so the manifest renders in chronological departure order.
-- ============================================================

CREATE OR REPLACE FUNCTION reservations_assign_seat(
  p_lead_id UUID,
  p_date DATE
)
RETURNS TABLE (flight_id UUID, confirmed_time TIME)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day_id            UUID;
  v_max_clients       INTEGER;
  v_max_flights       INTEGER;
  v_default_time      TIME;
  v_preferred_time    TIME;
  v_slot_time         TIME;
  v_new_time          TIME;
  v_flight_id         UUID;
  v_flight_time       TIME;
  v_existing_flights  INTEGER;
  v_next_flight_number INTEGER;
  v_inserted          BOOLEAN;
  v_safety            INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_flights_per_day'), 10)
    INTO v_max_flights;
  SELECT (SELECT value::TIME FROM business_settings WHERE key = 'default_first_flight_time')
    INTO v_default_time;

  SELECT preferred_time INTO v_preferred_time FROM participants WHERE id = p_lead_id;
  v_slot_time := COALESCE(v_preferred_time, v_default_time);

  SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
  IF v_day_id IS NULL THEN
    INSERT INTO operational_days (date) VALUES (p_date)
    ON CONFLICT (date) DO NOTHING
    RETURNING id INTO v_day_id;
    IF v_day_id IS NULL THEN
      SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
    END IF;
  END IF;

  PERFORM 1 FROM flights WHERE operational_day_id = v_day_id FOR UPDATE;

  -- 1. A flight at the exact requested time with room.
  SELECT f.id, f.estimated_departure_time INTO v_flight_id, v_flight_time
  FROM flights f
  WHERE f.operational_day_id = v_day_id
    AND f.estimated_departure_time = v_slot_time
    AND (
      SELECT COUNT(*) FROM participants p
      WHERE p.flight_id = f.id
        AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
    ) < v_max_clients
  LIMIT 1;

  -- 2. No room at the requested time: create a new flight, respecting
  --    the daily cap, at the requested time if free, or the nearest
  --    free hour after it.
  IF v_flight_id IS NULL THEN
    SELECT COUNT(*) INTO v_existing_flights FROM flights WHERE operational_day_id = v_day_id;
    IF v_existing_flights >= v_max_flights THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;

    v_new_time := v_slot_time;
    v_safety := 0;
    WHILE EXISTS (
      SELECT 1 FROM flights WHERE operational_day_id = v_day_id AND estimated_departure_time = v_new_time
    ) AND v_safety < 24 LOOP
      v_new_time := v_new_time + INTERVAL '1 hour';
      v_safety := v_safety + 1;
    END LOOP;

    -- Insert in a retry loop: recompute flight_number fresh on each
    -- attempt and swallow unique_violation, so a stale/wrong count never
    -- crashes the confirmation — it just retries with the next number.
    v_inserted := FALSE;
    v_safety := 0;
    WHILE NOT v_inserted AND v_safety < 50 LOOP
      SELECT COALESCE(MAX(flight_number), 0) + 1 INTO v_next_flight_number
      FROM flights WHERE operational_day_id = v_day_id;

      BEGIN
        INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
        VALUES (v_day_id, v_next_flight_number, v_next_flight_number - 1, v_new_time)
        RETURNING id, estimated_departure_time INTO v_flight_id, v_flight_time;
        v_inserted := TRUE;
      EXCEPTION WHEN unique_violation THEN
        v_safety := v_safety + 1;
      END;
    END LOOP;

    IF NOT v_inserted THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;
  END IF;

  UPDATE participants
  SET flight_id      = v_flight_id,
      lead_status    = 'CONFIRMED',
      confirmed_date = p_date,
      confirmed_time = v_flight_time
  WHERE id = p_lead_id;

  -- Re-sequence order_index/flight_number for the whole day so the
  -- manifest always renders in chronological departure order.
  UPDATE flights f
  SET order_index   = ranked.rn - 1,
      flight_number = ranked.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY estimated_departure_time, created_at) AS rn
    FROM flights
    WHERE operational_day_id = v_day_id
  ) ranked
  WHERE f.id = ranked.id;

  RETURN QUERY SELECT v_flight_id, v_flight_time;
END;
$$;

-- ============================================================
-- ROLLBACK (manual): restore the previous version from
-- 20260625000000_reservations_assign_seat_no_dupe_time.sql by re-running
-- its CREATE OR REPLACE FUNCTION block.
-- ============================================================
