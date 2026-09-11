import type { FlightWithParticipants, ReservationSource, PaymentMethod } from '@/types/domain'

const CANCELLED_STATUSES = ['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED']

/**
 * `maxClientsPerFlight` comes from business_settings (AvailabilityPolicy).
 * It used to be hardcoded to 2 here, so the day's capacity line would have
 * started lying the moment the aircraft or the tandem setup changed — the one
 * number in the header the staff reads as ground truth.
 */
export function computeManifestSummary(
  flights: FlightWithParticipants[],
  maxClientsPerFlight = 2
) {
  const allParticipants = flights.flatMap((f) => f.participants)
  const active = allParticipants.filter(
    (p) => !CANCELLED_STATUSES.includes(p.operationalStatus)
  )
  // Cancelled flights never flew: out of the flight count and capacity.
  const activeFlights = flights.filter((f) => f.status !== 'CANCELLED')

  const bySource: Partial<Record<ReservationSource, number>> = {}
  const byMethod: Partial<Record<PaymentMethod, number>> = {}
  let handycamCount = 0
  let externalCount = 0
  let totalRevenue = 0

  for (const p of active) {
    const source = (p.reservationGroup?.source ?? 'DIRECT') as ReservationSource
    bySource[source] = (bySource[source] ?? 0) + 1

    if (p.packageType === 'HANDYCAM' || p.packageType === 'HANDYCAM_FOTOS') handycamCount++
    if (p.packageType === 'VIDEO_EXTERNO') externalCount++
  }

  // "Cobrado" = money actually collected from EVERY participant of the day,
  // cancelled/no-show included: deposits are non-refundable (waiver), so a
  // cancellation never subtracts money that already came in. Matches the
  // treasury cash view.
  for (const p of allParticipants) {
    for (const pmt of p.payments) {
      totalRevenue += pmt.amount
      byMethod[pmt.method] = (byMethod[pmt.method] ?? 0) + pmt.amount
    }
  }

  const totalCapacity = activeFlights.length * maxClientsPerFlight

  return {
    totalFlights: activeFlights.length,
    totalJumps: active.length,
    totalCapacity,
    handycamCount,
    externalCount,
    totalRevenue,
    bySource,
    byMethod,
  }
}
