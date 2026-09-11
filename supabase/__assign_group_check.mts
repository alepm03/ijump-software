/**
 * __assign_group_check.mts — Correctness check for reservations_assign_group()
 *
 * Run with:  node_modules/.bin/jiti supabase/__assign_group_check.mts
 *
 * Why this exists: reservations_assign_group() is the most intricate piece of
 * SQL in the project (sliding window over the day's flights, all-or-nothing
 * seating, flight materialisation) and it is not reachable from the TypeScript
 * unit checks. The app's Supabase project lives in another organisation, so
 * this spins up a real Postgres in-process (PGlite, WASM — no Docker, no
 * network) over a faithful subset of the schema and runs the actual migration
 * files against it.
 *
 * Business rules under test (docs/reservas + Ricardo, 2026-09-11):
 *   - 2 clients per flight, 10 flights/day max, first flight 08:00,
 *     45 minutes between flights.
 *   - A group is seated whole or not at all: never split across days, never
 *     half-confirmed.
 *   - Groups get the CONTIGUOUS block of flights with the smallest span.
 *   - An explicitly requested hour wins over a tighter block elsewhere.
 *   - The organizer always takes the earliest flight of the block.
 *
 * Also covers the flight-cadence regression fixed in 20260911000001: 20260715
 * and 20260716 rebuilt reservations_assign_seat from a body that predated the
 * configurable interval and silently restored a hardcoded 1-hour step. Cases B
 * and F fail if the 45-minute cadence is not honoured.
 */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(import.meta.dirname, 'migrations')

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string, detail?: unknown): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    if (detail !== undefined) console.error(`        ${JSON.stringify(detail)}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

/**
 * Faithful subset of the production schema: the tables reservations_assign_group
 * actually touches, with the same types, defaults and constraints. Kept inline
 * so the check is self-contained — the migrations themselves are read from disk,
 * which is what we are testing.
 */
const FIXTURE_SCHEMA = `
CREATE TYPE flight_status AS ENUM ('SCHEDULED','BOARDING','IN_AIR','COMPLETED','DELAYED','CANCELLED');
CREATE TYPE operational_status AS ENUM ('PENDING','CHECKED_IN','WAIVER_SIGNED','BRIEFED','GEARED_UP','READY','COMPLETED','CANCELLED','NO_SHOW','WEATHER_CANCELLED');
CREATE TYPE package_type AS ENUM ('SOLO','HANDYCAM','VIDEO_EXTERNO','FOTOS','HANDYCAM_FOTOS');
CREATE TYPE reservation_source AS ENUM ('DIRECT','GROUPON','BONO','PROMO','SMARTBOX');
CREATE TYPE weather_status AS ENUM ('OK','MARGINAL','CANCELLED');

CREATE TABLE operational_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  weather_status weather_status NOT NULL DEFAULT 'OK',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE reservation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_name TEXT,
  source reservation_source NOT NULL DEFAULT 'DIRECT',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contact_phone TEXT, contact_email TEXT,
  channel TEXT NOT NULL DEFAULT 'STAFF', created_by TEXT
);
CREATE TABLE flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_day_id UUID NOT NULL REFERENCES operational_days(id) ON DELETE CASCADE,
  flight_number INTEGER NOT NULL,
  estimated_departure_time TIME,
  actual_departure_time TIME,
  status flight_status NOT NULL DEFAULT 'SCHEDULED',
  order_index INTEGER NOT NULL,
  is_back_to_back BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operational_day_id, flight_number)
);
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id UUID REFERENCES flights(id) ON DELETE SET NULL,
  reservation_group_id UUID REFERENCES reservation_groups(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT, email TEXT,
  package_type package_type NOT NULL DEFAULT 'SOLO',
  weight NUMERIC(5,1),
  overweight_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  operational_status operational_status NOT NULL DEFAULT 'PENDING',
  waiver_signed BOOLEAN NOT NULL DEFAULT FALSE,
  check_in_completed BOOLEAN NOT NULL DEFAULT FALSE,
  geared_up BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_status TEXT, preferred_date DATE, preferred_time TIME,
  confirmed_date DATE, confirmed_time TIME,
  deposit_paid BOOLEAN NOT NULL DEFAULT FALSE,
  channel TEXT NOT NULL DEFAULT 'STAFF', created_by TEXT,
  token UUID DEFAULT gen_random_uuid(),
  last_contact_at TIMESTAMPTZ
);
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL, stage TEXT NOT NULL, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE business_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO business_settings (key, value) VALUES
  ('max_flights_per_day','10'), ('max_clients_per_flight','2'),
  ('operating_weekdays','6,0'), ('default_first_flight_time','08:00'),
  ('flight_interval_minutes','45');
`

const DATE = '2026-10-04'

async function freshDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(FIXTURE_SCHEMA)
  await db.exec(readFileSync(join(MIGRATIONS, '20260911000000_reservation_groups.sql'), 'utf8'))
  await db.exec(readFileSync(join(MIGRATIONS, '20260911000001_reservations_assign_group.sql'), 'utf8'))
  return db
}

/** Creates a reservation group; the first name is the organizer. */
async function makeGroup(
  db: PGlite,
  names: string[],
  opts: { preferredTime?: string | null } = {}
): Promise<string> {
  const g = await db.query<{ id: string }>(
    `INSERT INTO reservation_groups (source) VALUES ('DIRECT') RETURNING id`
  )
  const groupId = g.rows[0].id
  for (let i = 0; i < names.length; i++) {
    await db.query(
      `INSERT INTO participants (reservation_group_id, full_name, lead_status, preferred_date, preferred_time, is_organizer)
       VALUES ($1, $2, 'NEW', $3, $4, $5)`,
      [groupId, names[i], DATE, i === 0 ? (opts.preferredTime ?? null) : null, i === 0]
    )
  }
  return groupId
}

type SeatRow = { full_name: string; t: string | null; flight_number: number | null }

async function seatsOf(db: PGlite, groupId: string): Promise<SeatRow[]> {
  const r = await db.query<SeatRow>(
    `SELECT p.full_name, f.estimated_departure_time::text AS t, f.flight_number
     FROM participants p LEFT JOIN flights f ON f.id = p.flight_id
     WHERE p.reservation_group_id = $1
     ORDER BY f.estimated_departure_time NULLS LAST, p.created_at`,
    [groupId]
  )
  return r.rows
}

function distinctTimes(rows: SeatRow[]): string {
  return [...new Set(rows.map((r) => r.t).filter(Boolean))].sort().join(',')
}

async function makeDay(db: PGlite): Promise<string> {
  const d = await db.query<{ id: string }>(
    `INSERT INTO operational_days (date) VALUES ($1) RETURNING id`, [DATE]
  )
  return d.rows[0].id
}

/** An existing flight at `time`, pre-filled with `taken` unrelated clients. */
async function makeFlight(
  db: PGlite, dayId: string, time: string, taken: number, number: number
): Promise<string> {
  const f = await db.query<{ id: string }>(
    `INSERT INTO flights (operational_day_id, flight_number, order_index, estimated_departure_time)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [dayId, number, number - 1, time]
  )
  for (let i = 0; i < taken; i++) {
    await db.query(`INSERT INTO participants (flight_id, full_name) VALUES ($1, $2)`,
      [f.rows[0].id, `otro-${time}-${i}`])
  }
  return f.rows[0].id
}

async function assignGroup(db: PGlite, groupId: string) {
  return db.query(`SELECT * FROM reservations_assign_group($1, $2)`, [groupId, DATE])
}

// ─── A. A couple fits in a single flight ─────────────────────

console.log('\nA. Pareja en día vacío')
{
  const db = await freshDb()
  const g = await makeGroup(db, ['Ana', 'Bea'])
  await assignGroup(db, g)
  const s = await seatsOf(db, g)
  assert(s.every((r) => r.t !== null), 'las dos quedan sentadas', s)
  assert(distinctTimes(s) === '08:00:00', 'comparten el primer vuelo del día', distinctTimes(s))
  await db.close()
}

// ─── B. Four people: two consecutive flights, 45 min apart ───

console.log('\nB. Grupo de 4 en día vacío')
{
  const db = await freshDb()
  const g = await makeGroup(db, ['Ana', 'Bea', 'Cris', 'Dani'])
  await assignGroup(db, g)
  const s = await seatsOf(db, g)
  assert(s.filter((r) => r.t).length === 4, 'los 4 quedan sentados', s)
  assert(distinctTimes(s) === '08:00:00,08:45:00',
    'dos vuelos consecutivos separados por la cadencia configurada (45 min, no 60)',
    distinctTimes(s))
  assert(s.find((r) => r.full_name === 'Ana')?.t === '08:00:00',
    'el organizador viaja en el primer vuelo del bloque', s)
  await db.close()
}

// ─── C. Contiguity beats using a stray free seat ─────────────

console.log('\nC. Hueco suelto frente a bloque contiguo')
{
  const db = await freshDb()
  const day = await makeDay(db)
  await makeFlight(db, day, '08:00', 1, 1)  // 1 libre
  await makeFlight(db, day, '08:45', 2, 2)  // lleno
  await makeFlight(db, day, '09:30', 0, 3)  // 2 libres
  const g = await makeGroup(db, ['Ana', 'Bea', 'Cris'])
  await assignGroup(db, g)
  const s = await seatsOf(db, g)
  assert(s.filter((r) => r.t).length === 3, 'los 3 quedan sentados', s)
  assert(distinctTimes(s) === '09:30:00,10:15:00',
    'elige 09:30 + vuelo nuevo (amplitud 1) en vez de 08:00+09:30 con un vuelo ajeno de por medio (amplitud 2)',
    distinctTimes(s))
  await db.close()
}

// ─── D. An explicit hour outranks a tighter block ────────────

console.log('\nD. La hora pedida por el cliente manda')
{
  const db = await freshDb()
  const day = await makeDay(db)
  await makeFlight(db, day, '08:00', 1, 1)
  await makeFlight(db, day, '08:45', 2, 2)
  await makeFlight(db, day, '09:30', 0, 3)
  const g = await makeGroup(db, ['Ana', 'Bea', 'Cris'], { preferredTime: '08:00' })
  await assignGroup(db, g)
  const s = await seatsOf(db, g)
  assert(s.find((r) => r.full_name === 'Ana')?.t === '08:00:00',
    'el organizador sale a la hora que pidió aunque el bloque sea más ancho', s)
  assert(s.filter((r) => r.t).length === 3, 'los 3 quedan sentados', s)
  await db.close()
}

// ─── E. All or nothing ───────────────────────────────────────

console.log('\nE. Día sin sitio: todo o nada')
{
  const db = await freshDb()
  const day = await makeDay(db)
  let minutes = 8 * 60
  for (let n = 1; n <= 10; n++) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    await makeFlight(db, day, `${hh}:${mm}`, 2, n)
    minutes += 45
  }
  const g = await makeGroup(db, ['Ana', 'Bea'])
  let raised: string | null = null
  try { await assignGroup(db, g) } catch (e) { raised = (e as Error).message }
  assert(raised?.includes('NO_SEATS_AVAILABLE') ?? false,
    'lanza NO_SEATS_AVAILABLE cuando el grupo no cabe', raised)
  const s = await seatsOf(db, g)
  assert(s.every((r) => r.t === null), 'no se sienta a nadie: nunca media reserva', s)
  const st = await db.query<{ lead_status: string }>(
    `SELECT lead_status FROM participants WHERE reservation_group_id = $1`, [g])
  assert(st.rows.every((r) => r.lead_status === 'NEW'),
    'el grupo entero sigue pendiente, listo para otra fecha', st.rows)
  await db.close()
}

// ─── F. Nine people, the largest non-event group ─────────────

console.log('\nF. Grupo de 9 (el máximo que no es evento)')
{
  const db = await freshDb()
  const g = await makeGroup(db, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
  await assignGroup(db, g)
  const s = await seatsOf(db, g)
  assert(s.filter((r) => r.t).length === 9, 'los 9 quedan sentados', s.length)
  assert(distinctTimes(s) === '08:00:00,08:45:00,09:30:00,10:15:00,11:00:00',
    '5 vuelos consecutivos de 08:00 a 11:00 a 45 min', distinctTimes(s))
  assert(s.filter((r) => r.t === '11:00:00').length === 1,
    'la plaza sobrante del último vuelo queda libre y vendible', s)
  await db.close()
}

// ─── G. Members already seated or cancelled are skipped ──────

console.log('\nG. Miembros ya sentados o cancelados')
{
  const db = await freshDb()
  const day = await makeDay(db)
  const flight = await makeFlight(db, day, '08:00', 0, 1)
  const g = await makeGroup(db, ['Ana', 'Bea', 'Cris'])
  await db.query(
    `UPDATE participants SET flight_id = $1, lead_status = 'CONFIRMED'
     WHERE full_name = 'Ana' AND reservation_group_id = $2`, [flight, g])
  await db.query(
    `UPDATE participants SET lead_status = 'CANCELLED', operational_status = 'CANCELLED'
     WHERE full_name = 'Cris' AND reservation_group_id = $1`, [g])

  const r = await assignGroup(db, g)
  assert(r.rows.length === 1, 'solo sienta al miembro que faltaba', r.rows)
  const s = await seatsOf(db, g)
  assert(s.find((x) => x.full_name === 'Bea')?.t === '08:00:00',
    'lo sienta junto al miembro que ya estaba, no en un vuelo nuevo', s)
  assert(s.find((x) => x.full_name === 'Cris')?.t === null,
    'el miembro cancelado no ocupa plaza', s)
  await db.close()
}

// ─── H. Idempotence and the single-organizer constraint ──────

console.log('\nH. Reejecución y organizador único')
{
  const db = await freshDb()
  const g = await makeGroup(db, ['Ana', 'Bea'])
  await assignGroup(db, g)
  const again = await assignGroup(db, g)
  assert(again.rows.length === 0, 'reconfirmar un grupo ya sentado no hace nada', again.rows)
  const flights = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM flights`)
  assert(flights.rows[0].c === 1, 'y no crea vuelos fantasma', flights.rows[0])

  let dup: string | null = null
  try {
    await db.query(
      `UPDATE participants SET is_organizer = TRUE
       WHERE full_name = 'Bea' AND reservation_group_id = $1`, [g])
  } catch (e) { dup = (e as Error).message }
  assert(dup !== null, 'la base de datos impide dos organizadores en un mismo grupo', dup)
  await db.close()
}

console.log('')
if (process.exitCode === 1) {
  console.log('❌ Some assertions FAILED.\n')
} else {
  console.log('✅ All assertions PASSED.\n')
}
