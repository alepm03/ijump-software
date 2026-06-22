-- ============================================================
-- Fix reservations_assign_seat: respect the lead's preferred_time.
--
-- Bug: the original version (20260623000000) never read
-- participants.preferred_time. It always assigned the slot's default
-- time and packed leads into the first flight with room regardless of
-- what time they asked for — so three leads requesting different
-- times on the same day all landed on a single 09:00 flight (or a
-- second 09:00 flight once the first filled up, instead of a slot at
-- their actual preferred time).
--
-- Fix: match (or create) a flight whose estimated_departure_time
-- equals the lead's preferred_time (falling back to
-- default_first_flight_time when the lead didn't ask for a specific
-- time), and only pack two leads into the same flight if they share
-- that time slot.
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
  v_preferred_time     TIME;
  v_slot_time         TIME;
  v_flight_id         UUID;
  v_existing_flights  INTEGER;
  v_next_flight_number INTEGER;
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

  -- Find a flight at the requested time slot that still has room.
  SELECT f.id INTO v_flight_id
  FROM flights f
  WHERE f.operational_day_id = v_day_id
    AND f.estimated_departure_time = v_slot_time
    AND (
      SELECT COUNT(*) FROM participants p
      WHERE p.flight_id = f.id
        AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
    ) < v_max_clients
  ORDER BY f.order_index
  LIMIT 1;

  IF v_flight_id IS NULL THEN
    -- No flight at that time slot with room: create a new one, respecting the daily cap.
    SELECT COUNT(*) INTO v_existing_flights FROM flights WHERE operational_day_id = v_day_id;

    IF v_existing_flights >= v_max_flights THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
    END IF;

    v_next_flight_number := v_existing_flights + 1;

    INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
    VALUES (v_day_id, v_next_flight_number, v_existing_flights, v_slot_time)
    RETURNING id INTO v_flight_id;
  END IF;

  UPDATE participants
  SET flight_id      = v_flight_id,
      lead_status    = 'CONFIRMED',
      confirmed_date = p_date,
      confirmed_time = v_slot_time
  WHERE id = p_lead_id;

  RETURN QUERY SELECT v_flight_id, v_slot_time;
END;
$$;

-- ============================================================
-- ROLLBACK (manual): restore the previous version from
-- 20260623000000_reservations_assign_seat.sql by re-running its
-- CREATE OR REPLACE FUNCTION block.
-- ============================================================
