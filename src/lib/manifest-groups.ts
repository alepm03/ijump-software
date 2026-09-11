/**
 * Group cohesion across a day's manifest.
 *
 * With 2 clients per flight, a booking of 4 cannot share one flight: it needs
 * two consecutive ones. reservations_assign_group already seats a party in the
 * tightest contiguous block available, but the manifest still has to SHOW that
 * those people belong together — otherwise the staff moving participants
 * around (drag & drop, cancelling a flight, reseating a no-show) has no way to
 * know they are breaking up a group, which is the one thing the client keeps
 * asking us not to do.
 *
 * Pure — no I/O — so the cohesion rules can be checked in isolation
 * (__manifest_groups_check.mts).
 */

import type { FlightWithParticipants } from '@/types/domain'

/** Statuses that mean "not actually flying" — same rule as the P&L engine. */
const NON_FLYING = new Set(['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED'])

export type GroupPresence = {
  groupId: string
  /** Members of this booking present in this day's manifest. */
  size: number
  /** 1-based position of each member within the booking, organizer first. */
  positionById: Record<string, number>
  /** Name shown on the chip — the organizer's, or the first member's. */
  label: string
  /**
   * True when the booking's members sit in flights that are NOT consecutive,
   * i.e. a flight carrying nobody from the group sits between two that do.
   * That is the case the staff wants to see and fix.
   */
  isSplit: boolean
  /** Stable index into the chip palette, so a group keeps its colour all day. */
  colorIndex: number
}

/** Badge palette — same soft-background/strong-text shape as every other badge. */
export const GROUP_CHIP_COLORS = [
  'bg-sky-50 text-sky-700',
  'bg-violet-50 text-violet-700',
  'bg-teal-50 text-teal-700',
  'bg-rose-50 text-rose-700',
  'bg-indigo-50 text-indigo-700',
  'bg-orange-50 text-orange-700',
] as const

/**
 * Groups present in this day, keyed by group id. Only bookings with 2+ flying
 * members show up: a booking of one is not a group, and lighting up a chip for
 * it would make every row noisy.
 */
export function computeDayGroups(
  flights: FlightWithParticipants[]
): Record<string, GroupPresence> {
  const activeFlights = flights.filter((f) => f.status !== 'CANCELLED')

  // Flight order is the manifest's own (already chronological); a group is
  // "split" when the gap between the first and last flight holding it is
  // wider than the number of flights it actually occupies.
  const membersByGroup = new Map<
    string,
    { participantId: string; isOrganizer: boolean; fullName: string; flightIndex: number }[]
  >()

  activeFlights.forEach((flight, flightIndex) => {
    for (const participant of flight.participants) {
      const groupId = participant.reservationGroupId
      if (!groupId) continue
      if (NON_FLYING.has(participant.operationalStatus)) continue
      const members = membersByGroup.get(groupId) ?? []
      members.push({
        participantId: participant.id,
        isOrganizer: participant.isOrganizer,
        fullName: participant.fullName,
        flightIndex,
      })
      membersByGroup.set(groupId, members)
    }
  })

  const result: Record<string, GroupPresence> = {}
  let colorIndex = 0

  for (const [groupId, members] of membersByGroup) {
    if (members.length < 2) continue

    // Organizer first, then by flight — the order they were seated in.
    const ordered = [...members].sort((a, b) => {
      if (a.isOrganizer !== b.isOrganizer) return a.isOrganizer ? -1 : 1
      return a.flightIndex - b.flightIndex
    })

    const positionById: Record<string, number> = {}
    ordered.forEach((m, i) => {
      positionById[m.participantId] = i + 1
    })

    const occupied = [...new Set(members.map((m) => m.flightIndex))].sort((a, b) => a - b)
    const span = occupied[occupied.length - 1] - occupied[0] + 1

    result[groupId] = {
      groupId,
      size: members.length,
      positionById,
      label: (ordered.find((m) => m.isOrganizer) ?? ordered[0]).fullName,
      isSplit: span > occupied.length,
      colorIndex: colorIndex++ % GROUP_CHIP_COLORS.length,
    }
  }

  return result
}

/** Bookings left sitting in non-consecutive flights — what the day header warns about. */
export function splitGroups(groups: Record<string, GroupPresence>): GroupPresence[] {
  return Object.values(groups).filter((g) => g.isSplit)
}
