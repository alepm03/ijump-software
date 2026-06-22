/**
 * availability-engine.ts — Pure availability/capacity computation module.
 *
 * This module is intentionally dependency-free beyond domain types:
 *   - NO 'use server'
 *   - NO DB / Supabase imports
 *   - NO Next.js imports
 *
 * All functions here are pure (deterministic, no side effects) and
 * therefore unit-testable without any infrastructure.
 *
 * See docs/reservas/RESERVAS_MODULE_PLAN_v1.md §3 for the business rules.
 */

import type {
  AvailabilityPolicy,
  DayLoad,
  DaySlots,
  DateClass,
} from '@/types/domain'

export type { AvailabilityPolicy, DayLoad, DaySlots, DateClass }

/**
 * Day of week for a YYYY-MM-DD date string, using UTC (matches
 * business_settings.operating_weekdays convention: JS Date.getUTCDay(),
 * 0=Sunday .. 6=Saturday).
 */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** Whether `date` falls on one of the center's operating weekdays. */
export function isOperatingDay(date: string, policy: AvailabilityPolicy): boolean {
  return policy.operatingWeekdays.includes(dayOfWeek(date))
}

/**
 * Compute the slot/capacity breakdown for a single day, given its current
 * flight load and the business policy (max flights/day, max clients/flight).
 */
export function computeDaySlots(load: DayLoad, policy: AvailabilityPolicy): DaySlots {
  const operatingDay = isOperatingDay(load.date, policy)
  const weatherCancelled = load.weatherStatus === 'CANCELLED'

  const existingFlights = load.flights.length

  const freeSeatsInExistingFlights = load.flights.reduce((sum, f) => {
    const free = policy.maxClientsPerFlight - f.activeParticipantCount
    return sum + Math.max(0, free)
  }, 0)

  const potentialNewFlights = Math.max(0, policy.maxFlightsPerDay - existingFlights)

  const totalFreeSeats =
    !operatingDay || weatherCancelled
      ? 0
      : freeSeatsInExistingFlights + potentialNewFlights * policy.maxClientsPerFlight

  const bookable = operatingDay && !weatherCancelled && totalFreeSeats > 0

  return {
    date: load.date,
    isOperatingDay: operatingDay,
    weatherCancelled,
    existingFlights,
    freeSeatsInExistingFlights,
    potentialNewFlights,
    totalFreeSeats,
    bookable,
  }
}

/**
 * Classify a target date for booking purposes.
 *
 * - NOT_OPERATING  — the weekday is not an operating day for the center
 * - UNAVAILABLE    — operating day but full (or weather-cancelled), or in the past
 * - CONFIRMABLE    — same calendar month as `today`, on/after `today`, with free seats
 *                     → the lead can be assigned a real flight_id immediately
 * - TENTATIVE_ONLY — a future month with free seats
 *                     → the lead is parked as TENTATIVE until that month arrives
 */
export function classifyDate(target: string, today: string, slots: DaySlots): DateClass {
  if (!slots.isOperatingDay) return 'NOT_OPERATING'
  if (slots.weatherCancelled || slots.totalFreeSeats === 0) return 'UNAVAILABLE'

  const targetMonth = target.slice(0, 7) // YYYY-MM
  const todayMonth = today.slice(0, 7)

  if (targetMonth === todayMonth && target >= today) return 'CONFIRMABLE'
  if (targetMonth > todayMonth) return 'TENTATIVE_ONLY'
  return 'UNAVAILABLE' // past date (this month before today, or a past month)
}
