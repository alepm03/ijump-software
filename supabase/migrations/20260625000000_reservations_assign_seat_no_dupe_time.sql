-- ============================================================
-- Fix reservations_assign_seat: no two flights at the same time,
-- and keep flights ordered chronologically in the manifest.
--
-- Two issues reported after 20260624000000:
-- 1. If the requested time slot is already full, the function created
--    a SECOND flight at that exact same time instead of reusing any
--    other flight with room or picking a free time slot. Two flights
--    departing at the same time on the same day doesn't make sense
--    operationally (one plane, one crew).
-- 2. order_index / flight_number were assigned in confirmation order,
--    not departure-time order, so a 09:00 flight confirmed AFTER a
--    14:00 flight showed up below it in the manifest.
--
-- Fix:
-- - Prefer a flight at the exact requested time with room (this is how
--   two leads end up sharing one tandem flight: both asked for the
--   same time).
-- - Otherwise, create a new flight at the requested time if that exact
--   time is free, or walking forward in 1-hour steps until a free time
--   is found — never merge into an unrelated flight at a different
--   time just because it has a spare seat; the requested time is what
--   the lead actually asked for.
-- - After assignment, re-sequence order_index/flight_number for the
--   whole day by estimated_departure_time so the manifest always
--   renders in chronological order regardless of confirmation order.
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

  -- Find or create the operational day for this date.
  SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
  IF v_day_id IS NULL THEN
    INSERT INTO operational_days (date) VALUES (p_date)
    ON CONFLICT (date) DO NOTHING
    RETURNING id INTO v_day_id;

    IF v_day_id IS NULL THEN
      -- Lost the insert race to a concurrent caller — read what they created.
      SELECT id INTO v_day_id FROM operational_days WHERE date = p_date;
    END IF;
  END IF;

  -- Lock every flight of this day so concurrent confirmations serialize
  -- instead of both reading the same "free seat" and double-booking it.
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
  --    free hour after it. Never silently reassign the lead into a
  --    different flight at a different time just because it has room.
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

    v_next_flight_number := v_existing_flights + 1;

    INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
    VALUES (v_day_id, v_next_flight_number, v_existing_flights, v_new_time)
    RETURNING id, estimated_departure_time INTO v_flight_id, v_flight_time;
  END IF;

  UPDATE participants
  SET flight_id      = v_flight_id,
      lead_status    = 'CONFIRMED',
      confirmed_date = p_date,
      confirmed_time = v_flight_time
  WHERE id = p_lead_id;

  -- Re-sequence order_index/flight_number for the whole day so the
  -- manifest always renders in chronological departure order,
  -- regardless of the order flights were confirmed/created in.
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
-- 20260624000000_reservations_assign_seat_fix_time.sql by re-running
-- its CREATE OR REPLACE FUNCTION block.
-- ============================================================
