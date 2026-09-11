/**
 * __manifest_groups_check.mts — Correctness check for computeDayGroups()
 *
 * Run with:  node_modules/.bin/jiti src/lib/__manifest_groups_check.mts
 *
 * What matters here is the "split" rule. A booking of 4 physically CANNOT
 * share one flight (2 clients per flight), so sitting in flights 1 and 2 is
 * correct and must NOT be flagged. What must be flagged is a booking whose
 * members have an unrelated flight wedged between them — that is the case the
 * staff has to fix, and the one thing the client keeps asking us to avoid.
 */

import { computeDayGroups, splitGroups } from './manifest-groups.js'
import type { FlightWithParticipants } from '../types/domain.js'

function assert(condition: boolean, msg: string, detail?: unknown): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    if (detail !== undefined) console.error(`        ${JSON.stringify(detail)}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

type Seat = { id: string; group: string | null; organizer?: boolean; status?: string }

/** Minimal manifest shape — only the fields computeDayGroups actually reads. */
function day(flights: Seat[][], cancelledFlights: number[] = []): FlightWithParticipants[] {
  return flights.map((seats, i) => ({
    id: `f${i}`,
    operationalDayId: 'd',
    flightNumber: i + 1,
    estimatedDepartureTime: null,
    actualDepartureTime: null,
    status: cancelledFlights.includes(i) ? 'CANCELLED' : 'SCHEDULED',
    orderIndex: i,
    isBackToBack: false,
    createdAt: '',
    participants: seats.map((seat) => ({
      id: seat.id,
      fullName: seat.id,
      reservationGroupId: seat.group,
      isOrganizer: seat.organizer ?? false,
      operationalStatus: seat.status ?? 'PENDING',
    })),
  })) as unknown as FlightWithParticipants[]
}

// ─── Consecutive flights are NOT a split ─────────────────────

console.log('\nA. Grupo de 4 en dos vuelos seguidos')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1' }],
    [{ id: 'c', group: 'g1' }, { id: 'd', group: 'g1' }],
  ]))
  assert(groups.g1.size === 4, 'reconoce a los 4 miembros', groups.g1)
  assert(
    !groups.g1.isSplit,
    'dos vuelos seguidos NO es partir el grupo: 4 personas no caben en un vuelo',
    groups.g1
  )
  assert(groups.g1.label === 'a', 'la etiqueta es el nombre del organizador', groups.g1)
  assert(groups.g1.positionById['a'] === 1, 'el organizador es el 1 de 4', groups.g1)
}

console.log('\nB. Pareja en el mismo vuelo')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1' }],
  ]))
  assert(groups.g1.size === 2 && !groups.g1.isSplit, 'pareja junta: sin aviso', groups.g1)
}

// ─── Un vuelo ajeno de por medio SÍ es un split ──────────────

console.log('\nC. Vuelo ajeno intercalado')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1' }],
    [{ id: 'x', group: null }, { id: 'y', group: null }],
    [{ id: 'c', group: 'g1' }, { id: 'd', group: 'g1' }],
  ]))
  assert(groups.g1.isSplit, 'avisa: el grupo ha quedado repartido en vuelos no consecutivos', groups.g1)
  assert(splitGroups(groups).length === 1, 'y sale en la lista de grupos partidos', splitGroups(groups))
}

// ─── Reservas de una persona no son grupo ────────────────────

console.log('\nD. Reservas individuales')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g2', organizer: true }],
  ]))
  assert(
    Object.keys(groups).length === 0,
    'una reserva de 1 persona no pinta chip: ensuciaría todas las filas',
    groups
  )
}

// ─── Cancelados y vuelos cancelados no cuentan ───────────────

console.log('\nE. Miembros cancelados y vuelos cancelados')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1', status: 'CANCELLED' }],
  ]))
  assert(
    Object.keys(groups).length === 0,
    'un grupo con un solo miembro volando deja de ser grupo',
    groups
  )
}
{
  // The unrelated flight in the middle is cancelled: nobody flies on it, so
  // the group is effectively consecutive and must not be flagged.
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1' }],
    [{ id: 'x', group: null }],
    [{ id: 'c', group: 'g1' }],
  ], [1]))
  assert(!groups.g1.isSplit, 'un vuelo cancelado de por medio no cuenta como separación', groups.g1)
}

// ─── Varios grupos el mismo día ──────────────────────────────

console.log('\nF. Dos grupos el mismo día')
{
  const groups = computeDayGroups(day([
    [{ id: 'a', group: 'g1', organizer: true }, { id: 'b', group: 'g1' }],
    [{ id: 'c', group: 'g2', organizer: true }, { id: 'd', group: 'g2' }],
  ]))
  assert(Object.keys(groups).length === 2, 'los dos se detectan', Object.keys(groups))
  assert(
    groups.g1.colorIndex !== groups.g2.colorIndex,
    'cada grupo recibe un color distinto para poder distinguirlos de un vistazo',
    [groups.g1.colorIndex, groups.g2.colorIndex]
  )
}

console.log('')
if (process.exitCode === 1) {
  console.log('❌ Some assertions FAILED.\n')
} else {
  console.log('✅ All assertions PASSED.\n')
}
