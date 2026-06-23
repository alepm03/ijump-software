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
 * Rolling confirmation window, in days. A date within this many days of
 * `today` is CONFIRMABLE; beyond it, TENTATIVE_ONLY. Deliberately a fixed
 * day count rather than "same calendar month" — a calendar-month boundary
 * shrinks the effective window as the month progresses (e.g. on the 28th,
 * next weekend already falls in next month and would wrongly classify as
 * tentative even though it's only ~1 week away).
 */
export const CONFIRMABLE_WINDOW_DAYS = 30

/** Whole days between two YYYY-MM-DD date strings (UTC, DST-safe). */
function daysBetween(from: string, to: string): number {
  const ms = Date.UTC(...parseIso(to)) - Date.UTC(...parseIso(from))
  return Math.round(ms / 86_400_000)
}

function parseIso(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m - 1, d]
}

/**
 * Classify a target date for booking purposes.
 *
 * - NOT_OPERATING  — the weekday is not an operating day for the center
 * - UNAVAILABLE    — operating day but full (or weather-cancelled), or in the past
 * - CONFIRMABLE    — within CONFIRMABLE_WINDOW_DAYS of `today`, with free seats
 *                     → the lead can be assigned a real flight_id immediately
 * - TENTATIVE_ONLY — beyond that window, with free seats
 *                     → the lead is parked as TENTATIVE until the window reaches it
 */
export function classifyDate(target: string, today: string, slots: DaySlots): DateClass {
  if (!slots.isOperatingDay) return 'NOT_OPERATING'
  if (slots.weatherCancelled || slots.totalFreeSeats === 0) return 'UNAVAILABLE'

  if (target < today) return 'UNAVAILABLE' // past date

  const daysAhead = daysBetween(today, target)
  return daysAhead <= CONFIRMABLE_WINDOW_DAYS ? 'CONFIRMABLE' : 'TENTATIVE_ONLY'
}
