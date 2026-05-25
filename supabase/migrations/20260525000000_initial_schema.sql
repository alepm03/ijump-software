-- ============================================================
-- iJump Operational System — Initial Schema
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE weather_status AS ENUM ('OK', 'MARGINAL', 'CANCELLED');

CREATE TYPE flight_status AS ENUM (
  'SCHEDULED',
  'BOARDING',
  'IN_AIR',
  'COMPLETED',
  'DELAYED',
  'CANCELLED'
);

CREATE TYPE operational_status AS ENUM (
  'PENDING',
  'CHECKED_IN',
  'WAIVER_SIGNED',
  'BRIEFED',
  'GEARED_UP',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'WEATHER_CANCELLED'
);

CREATE TYPE package_type AS ENUM (
  'SOLO',
  'HANDYCAM',
  'VIDEO_EXTERNO',
  'FOTOS',
  'HANDYCAM_FOTOS'
);

CREATE TYPE reservation_source AS ENUM (
  'DIRECT',
  'GROUPON',
  'BONO',
  'PROMO',
  'SMARTBOX'
);

CREATE TYPE payment_method AS ENUM (
  'EFECTIVO',
  'TARJETA',
  'BIZUM',
  'TRANSFERENCIA',
  'GROUPON'
);

CREATE TYPE payment_stage AS ENUM (
  'RESERVA',
  'LIQUIDACION',
  'SUPLEMENTO'
);

-- ============================================================
-- UTILITY: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLES
-- ============================================================

-- instructors
CREATE TABLE instructors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- operational_days
CREATE TABLE operational_days (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE NOT NULL UNIQUE,
  weather_status weather_status NOT NULL DEFAULT 'OK',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_operational_days_updated_at
  BEFORE UPDATE ON operational_days
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- reservation_groups
CREATE TABLE reservation_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_name TEXT,
  source     reservation_source NOT NULL DEFAULT 'DIRECT',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- flights
CREATE TABLE flights (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_day_id       UUID NOT NULL REFERENCES operational_days(id) ON DELETE CASCADE,
  flight_number            INTEGER NOT NULL,
  estimated_departure_time TIME,
  actual_departure_time    TIME,
  status                   flight_status NOT NULL DEFAULT 'SCHEDULED',
  order_index              INTEGER NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operational_day_id, flight_number)
);

-- participants
CREATE TABLE participants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id             UUID REFERENCES flights(id) ON DELETE SET NULL,
  reservation_group_id  UUID REFERENCES reservation_groups(id) ON DELETE SET NULL,
  assigned_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  full_name             TEXT NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  package_type          package_type NOT NULL DEFAULT 'SOLO',
  weight                NUMERIC(5, 1),
  overweight_fee        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  operational_status    operational_status NOT NULL DEFAULT 'PENDING',
  waiver_signed         BOOLEAN NOT NULL DEFAULT FALSE,
  check_in_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  geared_up             BOOLEAN NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- payments
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount         NUMERIC(10, 2) NOT NULL,
  method         payment_method NOT NULL,
  stage          payment_stage NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- waivers
CREATE TABLE waivers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_url        TEXT,
  signature_url  TEXT,
  accepted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_flights_operational_day_id ON flights(operational_day_id);
CREATE INDEX idx_flights_order ON flights(operational_day_id, order_index);
CREATE INDEX idx_participants_flight_id ON participants(flight_id);
CREATE INDEX idx_participants_reservation_group_id ON participants(reservation_group_id);
CREATE INDEX idx_participants_instructor_id ON participants(assigned_instructor_id);
CREATE INDEX idx_payments_participant_id ON payments(participant_id);
CREATE INDEX idx_waivers_participant_id ON waivers(participant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE instructors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights             ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE waivers             ENABLE ROW LEVEL SECURITY;

-- MVP: authenticated users have full access to all tables
CREATE POLICY "Authenticated full access" ON instructors
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON operational_days
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON reservation_groups
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON flights
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON participants
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON payments
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated full access" ON waivers
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
