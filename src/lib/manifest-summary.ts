import type { FlightWithParticipants, ReservationSource, PaymentMethod } from '@/types/domain'

const CANCELLED_STATUSES = ['CANCELLED', 'NO_SHOW', 'WEATHER_CANCELLED']

export function computeManifestSummary(flights: FlightWithParticipants[]) {
  const allParticipants = flights.flatMap((f) => f.participants)
  const active = allParticipants.filter(
    (p) => !CANCELLED_STATUSES.includes(p.operationalStatus)
  )

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

    for (const pmt of p.payments) {
      totalRevenue += pmt.amount
      byMethod[pmt.method] = (byMethod[pmt.method] ?? 0) + pmt.amount
    }
  }

  // Capacity: 2 clients per flight
  const totalCapacity = flights.length * 2

  return {
    totalFlights: flights.length,
    totalJumps: active.length,
    totalCapacity,
    handycamCount,
    externalCount,
    totalRevenue,
    bySource,
    byMethod,
  }
}
