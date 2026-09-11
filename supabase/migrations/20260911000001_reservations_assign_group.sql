-- ============================================================
-- Asignación de asientos para una reserva de grupo (todo o nada)
--
-- Dos cosas en esta migración:
--
-- 1. ARREGLO DE REGRESIÓN en reservations_assign_seat.
--    20260704 hizo configurable la cadencia de vuelos
--    (business_settings.flight_interval_minutes = 45), pero 20260715 y
--    20260716 reconstruyeron la función a partir de un cuerpo anterior al
--    cambio y volvieron a fijar INTERVAL '1 hour'. En producción, los
--    vuelos que se autocrean salen cada 60 minutos en lugar de cada 45.
--    Se restaura la lectura del setting. El resto del cuerpo es
--    literalmente el de 20260716, sin ningún otro cambio.
--
-- 2. reservations_assign_group(p_group_id, p_date) — NUEVA.
--    Sienta a TODOS los miembros de una reserva de grupo o a NINGUNO.
--
--    Por qué hace falta: con max_clients_per_flight = 2, un grupo de 4 no
--    cabe en un vuelo. Confirmar a los miembros uno a uno con
--    reservations_assign_seat puede repartirlos entre los vuelos 1, 3 y 7
--    del día, que es justo lo que el cliente pide que no pase. "No partir
--    el grupo" solo puede significar mismo día y vuelos consecutivos.
--
--    Algoritmo:
--      a) Se listan los miembros sin asiento, organizador primero (si el
--         grupo acaba repartido, el organizador queda en el primer vuelo).
--      b) Se construye la lista de huecos del día ordenada por hora: los
--         vuelos existentes con sus plazas libres, más los vuelos que
--         todavía se podrían crear (respetando max_flights_per_day y
--         flight_interval_minutes).
--      c) Ventana deslizante: se busca el bloque CONTIGUO de vuelos de
--         menor amplitud cuya suma de huecos alcance para todo el grupo.
--         Si el organizador pidió hora concreta, gana el bloque que
--         empieza a esa hora aunque sea más ancho: se respeta lo pedido.
--      d) Si no existe ningún bloque suficiente -> NO_SEATS_AVAILABLE y no
--         se sienta a nadie. Nunca se parte el grupo entre días ni se deja
--         media reserva confirmada.
--      e) Se materializan los vuelos necesarios y se sienta a los N.
--
--    Una ventana puede incluir un vuelo lleno de por medio (cuenta para la
--    amplitud pero no aporta plazas). Como se minimiza la amplitud, los
--    bloques sin huecos ajenos ganan siempre; si la única opción viable
--    tiene un vuelo ajeno intercalado se sienta igual, y la UI marca el
--    grupo como repartido en vuelos no consecutivos. Es mejor que negar
--    una reserva que sí cabe en el día.
--
-- Aditiva y reversible. Bloque de ROLLBACK al final.
-- ============================================================

-- ============================================================
-- 1. reservations_assign_seat — cadencia configurable restaurada
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
  v_interval_minutes  INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_flights_per_day'), 10)
    INTO v_max_flights;
  SELECT (SELECT value::TIME FROM business_settings WHERE key = 'default_first_flight_time')
    INTO v_default_time;
  -- Regresión arreglada (2026-09-11): 20260704 hizo configurable la cadencia,
  -- pero 20260715 y 20260716 reconstruyeron la función desde un cuerpo
  -- anterior y volvieron a fijar INTERVAL '1 hour'. Se restaura la lectura
  -- de flight_interval_minutes (fallback 60), igual que en 20260704.
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'flight_interval_minutes'), 60)
    INTO v_interval_minutes;

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

  -- 0. "Any hour" request: earliest non-cancelled flight of the day with room.
  IF v_preferred_time IS NULL THEN
    SELECT f.id, f.estimated_departure_time INTO v_flight_id, v_flight_time
    FROM flights f
    WHERE f.operational_day_id = v_day_id
      AND f.status <> 'CANCELLED'
      AND (
        SELECT COUNT(*) FROM participants p
        WHERE p.flight_id = f.id
          AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
      ) < v_max_clients
    ORDER BY f.estimated_departure_time NULLS LAST, f.created_at
    LIMIT 1;
  END IF;

  -- 1. A flight at the exact requested time with room.
  IF v_flight_id IS NULL THEN
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
  END IF;

  -- 1b. Specific-hour conflict: the caller asked for an exact time, no flight
  --     at that time has room, AND a (non-cancelled) flight already exists
  --     there — so it is full. Do NOT relocate to another hour: raise so the
  --     lead stays a Conflicto for the staff to resolve.
  IF v_flight_id IS NULL AND v_preferred_time IS NOT NULL AND EXISTS (
    SELECT 1 FROM flights
    WHERE operational_day_id = v_day_id
      AND estimated_departure_time = v_slot_time
      AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
  END IF;

  -- 2. No room at the requested time and no flight exists there yet: create a
  --    new flight, respecting the daily cap, at the requested time if free, or
  --    the nearest free hour after it.
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
      v_new_time := v_new_time + make_interval(mins => v_interval_minutes);
      v_safety := v_safety + 1;
    END LOOP;

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
-- 2. reservations_assign_group — todo o nada para reservas de grupo
-- ============================================================

CREATE OR REPLACE FUNCTION reservations_assign_group(
  p_group_id UUID,
  p_date DATE
)
RETURNS TABLE (participant_id UUID, flight_id UUID, confirmed_time TIME)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day_id             UUID;
  v_max_clients        INTEGER;
  v_max_flights        INTEGER;
  v_default_time       TIME;
  v_interval_minutes   INTEGER;
  v_preferred_time     TIME;
  v_base_time          TIME;
  v_member_ids         UUID[];
  v_needed             INTEGER;
  -- Huecos candidatos del día: vuelos existentes + vuelos aún por crear.
  -- Arrays paralelos, ya ordenados por hora de salida.
  v_slot_flight_id     UUID[];
  v_slot_time          TIME[];
  v_slot_free          INTEGER[];
  v_slot_count         INTEGER;
  v_existing_flights   INTEGER;
  v_slack              INTEGER;
  v_best_start         INTEGER := NULL;
  v_best_end           INTEGER := NULL;
  v_best_span          INTEGER := NULL;
  v_best_at_preferred  BOOLEAN := FALSE;
  v_at_preferred       BOOLEAN;
  v_acc                INTEGER;
  v_cursor             INTEGER;
  v_take               INTEGER;
  v_flight_id          UUID;
  v_flight_time        TIME;
  v_next_flight_number INTEGER;
  v_inserted           BOOLEAN;
  v_safety             INTEGER;
  i                    INTEGER;
  j                    INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_clients_per_flight'), 2)
    INTO v_max_clients;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'max_flights_per_day'), 10)
    INTO v_max_flights;
  SELECT COALESCE((SELECT value::TIME FROM business_settings WHERE key = 'default_first_flight_time'), TIME '09:00')
    INTO v_default_time;
  SELECT COALESCE((SELECT value::INTEGER FROM business_settings WHERE key = 'flight_interval_minutes'), 60)
    INTO v_interval_minutes;

  -- a) Miembros pendientes de asiento. Organizador primero.
  SELECT COALESCE(array_agg(p.id ORDER BY p.is_organizer DESC, p.created_at, p.id), '{}')
    INTO v_member_ids
  FROM participants p
  WHERE p.reservation_group_id = p_group_id
    AND p.flight_id IS NULL
    AND (p.lead_status IS NULL OR p.lead_status <> 'CANCELLED')
    AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED');

  v_needed := COALESCE(array_length(v_member_ids, 1), 0);
  IF v_needed = 0 THEN
    RETURN;
  END IF;

  -- La hora pedida es la del organizador: es la reserva del grupo entero.
  SELECT p.preferred_time INTO v_preferred_time
  FROM participants p WHERE p.id = v_member_ids[1];
  v_base_time := COALESCE(v_preferred_time, v_default_time);

  SELECT d.id INTO v_day_id FROM operational_days d WHERE d.date = p_date;
  IF v_day_id IS NULL THEN
    INSERT INTO operational_days (date) VALUES (p_date)
    ON CONFLICT (date) DO NOTHING
    RETURNING id INTO v_day_id;
    IF v_day_id IS NULL THEN
      SELECT d.id INTO v_day_id FROM operational_days d WHERE d.date = p_date;
    END IF;
  END IF;

  -- Mismo candado que reservations_assign_seat: dos confirmaciones
  -- simultáneas sobre el mismo día se serializan aquí.
  PERFORM 1 FROM flights f WHERE f.operational_day_id = v_day_id FOR UPDATE;

  SELECT COUNT(*) INTO v_existing_flights FROM flights f WHERE f.operational_day_id = v_day_id;
  v_slack := GREATEST(v_max_flights - v_existing_flights, 0);

  -- b) Huecos del día: existentes + virtuales, todo ordenado por hora.
  --    Los virtuales arrancan en la hora pedida (o la primera del día) y
  --    avanzan a la cadencia configurada, saltando horas ya ocupadas.
  WITH occupancy AS (
    SELECT f.id,
           f.estimated_departure_time AS t,
           GREATEST(v_max_clients - (
             SELECT COUNT(*) FROM participants p
             WHERE p.flight_id = f.id
               AND p.operational_status NOT IN ('CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED')
           ), 0)::INTEGER AS free
    FROM flights f
    WHERE f.operational_day_id = v_day_id
      AND f.status <> 'CANCELLED'
  ),
  candidates AS (
    -- Se generan de más para que, tras descartar las horas ocupadas,
    -- sigan quedando v_slack candidatas reales.
    SELECT (v_base_time + make_interval(mins => v_interval_minutes * (g - 1)))::TIME AS t
    FROM generate_series(1, v_slack + v_existing_flights + 1) AS g
  ),
  virtual AS (
    SELECT NULL::UUID AS id, c.t, v_max_clients AS free
    FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM flights f
      WHERE f.operational_day_id = v_day_id
        AND f.estimated_departure_time = c.t
    )
    ORDER BY c.t
    LIMIT v_slack
  ),
  all_slots AS (
    SELECT o.id, o.t, o.free, 0 AS ord FROM occupancy o
    UNION ALL
    SELECT v.id, v.t, v.free, 1 AS ord FROM virtual v
  )
  SELECT COALESCE(array_agg(s.id   ORDER BY s.t NULLS LAST, s.ord, s.id), '{}'),
         COALESCE(array_agg(s.t    ORDER BY s.t NULLS LAST, s.ord, s.id), '{}'),
         COALESCE(array_agg(s.free ORDER BY s.t NULLS LAST, s.ord, s.id), '{}')
    INTO v_slot_flight_id, v_slot_time, v_slot_free
  FROM all_slots s;

  v_slot_count := COALESCE(array_length(v_slot_free, 1), 0);

  -- c) Ventana deslizante: bloque contiguo de menor amplitud que dé para N.
  FOR i IN 1..v_slot_count LOOP
    -- Una ventana nunca empieza en un vuelo lleno: sería amplitud gastada.
    IF v_slot_free[i] > 0 THEN
      v_acc := 0;
      j := i - 1;
      WHILE j < v_slot_count AND v_acc < v_needed LOOP
        j := j + 1;
        v_acc := v_acc + v_slot_free[j];
      END LOOP;

      IF v_acc >= v_needed THEN
        v_at_preferred := (v_preferred_time IS NOT NULL AND v_slot_time[i] = v_preferred_time);
        IF v_best_start IS NULL
           OR (v_at_preferred AND NOT v_best_at_preferred)
           OR (v_at_preferred = v_best_at_preferred AND (j - i) < v_best_span)
        THEN
          v_best_start        := i;
          v_best_end          := j;
          v_best_span         := j - i;
          v_best_at_preferred := v_at_preferred;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- d) Sin bloque suficiente: no se sienta a nadie.
  IF v_best_start IS NULL THEN
    RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
  END IF;

  -- e) Materializar.
  v_cursor := 1;
  FOR i IN v_best_start..v_best_end LOOP
    EXIT WHEN v_cursor > v_needed;
    CONTINUE WHEN v_slot_free[i] <= 0;

    v_flight_id   := v_slot_flight_id[i];
    v_flight_time := v_slot_time[i];

    IF v_flight_id IS NULL THEN
      -- Vuelo virtual: crearlo con el mismo retry de flight_number que
      -- reservations_assign_seat (dos confirmaciones simultáneas pueden
      -- pelearse por el mismo número dentro del día).
      v_inserted := FALSE;
      v_safety   := 0;
      WHILE NOT v_inserted AND v_safety < 50 LOOP
        SELECT COALESCE(MAX(f.flight_number), 0) + 1 INTO v_next_flight_number
        FROM flights f WHERE f.operational_day_id = v_day_id;
        BEGIN
          INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
          VALUES (v_day_id, v_next_flight_number, v_next_flight_number - 1, v_flight_time)
          RETURNING id INTO v_flight_id;
          v_inserted := TRUE;
        EXCEPTION WHEN unique_violation THEN
          v_safety := v_safety + 1;
        END;
      END LOOP;
      IF NOT v_inserted THEN
        RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
      END IF;
    END IF;

    v_take := LEAST(v_slot_free[i], v_needed - v_cursor + 1);

    UPDATE participants p
    SET flight_id       = v_flight_id,
        lead_status     = 'CONFIRMED',
        confirmed_date  = p_date,
        confirmed_time  = v_flight_time,
        last_contact_at = NOW()
    WHERE p.id = ANY (v_member_ids[v_cursor : v_cursor + v_take - 1]);

    RETURN QUERY
      SELECT m.id, v_flight_id, v_flight_time
      FROM unnest(v_member_ids[v_cursor : v_cursor + v_take - 1]) AS m(id);

    v_cursor := v_cursor + v_take;
  END LOOP;

  -- Red de seguridad: la ventana se eligió con hueco de sobra, así que esto
  -- no debería ocurrir. Si ocurre, se aborta la transacción entera antes que
  -- dejar medio grupo confirmado.
  IF v_cursor <= v_needed THEN
    RAISE EXCEPTION 'NO_SEATS_AVAILABLE';
  END IF;

  -- Re-secuenciar el día para que el manifest se pinte en orden cronológico
  -- (mismo cierre que reservations_assign_seat).
  UPDATE flights f
  SET order_index   = ranked.rn - 1,
      flight_number = ranked.rn
  FROM (
    SELECT fl.id, ROW_NUMBER() OVER (ORDER BY fl.estimated_departure_time, fl.created_at) AS rn
    FROM flights fl
    WHERE fl.operational_day_id = v_day_id
  ) ranked
  WHERE f.id = ranked.id;

  RETURN;
END;
$$;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS reservations_assign_group(UUID, DATE);
-- reservations_assign_seat: volver a ejecutar el bloque CREATE OR REPLACE de
-- 20260716000000_reservations_assign_seat_exact_time_conflict.sql (recupera
-- la cadencia fija de 1 hora, es decir, la regresión).
