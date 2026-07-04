/**
 * __availability_check.mts — Standalone correctness check for availability-engine.ts
 *
 * Run with:  node_modules/.bin/jiti src/lib/availability/__availability_check.mts
 *
 * Policy under test: weekends-only, 2 clients/flight, 10 flights/day max
 * (see docs/reservas/RESERVAS_MODULE_PLAN_v1.md §2.5 business_settings seed).
 *
 * Reference dates (2026, non-leap year, verified by day-of-year math):
 *   2026-06-20  Saturday   (past, before TODAY)
 *   2026-06-22  Monday     == TODAY (anchor for the rolling-window tests)
 *   2026-06-24  Wednesday  (weekday, NOT an operating day)
 *   2026-06-27  Saturday   (future, 5 days ahead — within the 30-day window)
 *   2026-08-01  Saturday   (40 days ahead — beyond the 30-day window, TENTATIVE_ONLY)
 *
 * Regression coverage for the calendar-month bug (fixed 2026-06-23): classifying
 * by "same calendar month" instead of a rolling day window meant a date just
 * past a month boundary (e.g. asking on the 28th for the following weekend,
 * which fell in the next month) was wrongly TENTATIVE_ONLY even though it was
 * only days away. TODAY2/TARGET2 below reproduce that exact scenario.
 */

import {
  isOperatingDay,
  computeDaySlots,
  classifyDate,
  type AvailabilityPolicy,
  type DayLoad,
} from './availability-engine.js'

// ─── Helpers ─────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

// ─── Fixtures ────────────────────────────────────────────────

const TODAY = '2026-06-22' // Monday

const POLICY: AvailabilityPolicy = {
  maxClientsPerFlight: 2,
  maxFlightsPerDay: 10,
  operatingWeekdays: [6, 0], // Saturday, Sunday
  flightIntervalMinutes: 60,
}

console.log('\n=== Availability Engine Validation ===\n')

// ─── isOperatingDay ──────────────────────────────────────────

console.log('-- isOperatingDay --')
assert(isOperatingDay('2026-06-27', POLICY) === true,
  'Saturday 2026-06-27 is an operating day')
assert(isOperatingDay('2026-06-24', POLICY) === false,
  'Wednesday 2026-06-24 is NOT an operating day')

// ─── computeDaySlots: capacity (2 clients/flight) ───────────

console.log('\n-- computeDaySlots: per-flight capacity --')
const partiallyFullDay: DayLoad = {
  date: '2026-06-27',
  weatherStatus: 'OK',
  flights: [
    { id: 'f1', activeParticipantCount: 2 }, // full
    { id: 'f2', activeParticipantCount: 1 }, // 1 free seat
  ],
}
const slotsPartial = computeDaySlots(partiallyFullDay, POLICY)
assert(slotsPartial.freeSeatsInExistingFlights === 1,
  `1 free seat across existing flights (got ${slotsPartial.freeSeatsInExistingFlights})`)
assert(slotsPartial.potentialNewFlights === 8,
  `8 more flights could be created (10 - 2 existing; got ${slotsPartial.potentialNewFlights})`)
assert(slotsPartial.totalFreeSeats === 17,
  `totalFreeSeats === 17 (1 + 8×2; got ${slotsPartial.totalFreeSeats})`)
assert(slotsPartial.bookable === true,
  'day is bookable')

// ─── computeDaySlots: max_flights_per_day limit ─────────────

console.log('\n-- computeDaySlots: max_flights_per_day limit --')
const fullDay: DayLoad = {
  date: '2026-06-27',
  weatherStatus: 'OK',
  flights: Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, activeParticipantCount: 2 })),
}
const slotsFull = computeDaySlots(fullDay, POLICY)
assert(slotsFull.potentialNewFlights === 0,
  `no more flights can be created at the cap (got ${slotsFull.potentialNewFlights})`)
assert(slotsFull.totalFreeSeats === 0,
  `totalFreeSeats === 0 when the day is at full capacity (got ${slotsFull.totalFreeSeats})`)
assert(slotsFull.bookable === false,
  'a full day is not bookable')

// ─── computeDaySlots: weather cancellation ──────────────────

console.log('\n-- computeDaySlots: weather cancellation --')
const weatherCancelledDay: DayLoad = {
  date: '2026-06-27',
  weatherStatus: 'CANCELLED',
  flights: [],
}
const slotsWeather = computeDaySlots(weatherCancelledDay, POLICY)
assert(slotsWeather.totalFreeSeats === 0,
  `totalFreeSeats === 0 when weather-cancelled despite no flights yet (got ${slotsWeather.totalFreeSeats})`)
assert(slotsWeather.bookable === false,
  'a weather-cancelled day is not bookable')

// ─── classifyDate ────────────────────────────────────────────

console.log('\n-- classifyDate --')

// Within the rolling window (5 days ahead), with free seats -> CONFIRMABLE
assert(classifyDate('2026-06-27', TODAY, slotsPartial) === 'CONFIRMABLE',
  'date 5 days ahead with free seats classifies as CONFIRMABLE')

// Beyond the rolling window (40 days ahead), with free seats -> TENTATIVE_ONLY
const beyondWindowDay: DayLoad = { date: '2026-08-01', weatherStatus: 'OK', flights: [] }
const slotsBeyondWindow = computeDaySlots(beyondWindowDay, POLICY)
assert(classifyDate('2026-08-01', TODAY, slotsBeyondWindow) === 'TENTATIVE_ONLY',
  'date 40 days ahead with free seats classifies as TENTATIVE_ONLY')

// Regression: asking near a month boundary for a date just past it must NOT
// fall back to TENTATIVE_ONLY just because it's technically "next month".
const TODAY2 = '2026-06-28' // Sunday
const TARGET2 = '2026-07-04' // Saturday, 6 days ahead, crosses the month boundary
const nextWeekendDay: DayLoad = { date: TARGET2, weatherStatus: 'OK', flights: [] }
const slotsNextWeekend = computeDaySlots(nextWeekendDay, POLICY)
assert(classifyDate(TARGET2, TODAY2, slotsNextWeekend) === 'CONFIRMABLE',
  'a date just past a month boundary but within the rolling window classifies as CONFIRMABLE (regression: calendar-month classification)')

// Full day -> UNAVAILABLE
assert(classifyDate('2026-06-27', TODAY, slotsFull) === 'UNAVAILABLE',
  'a full day classifies as UNAVAILABLE')

// Weekday (not an operating day) -> NOT_OPERATING, regardless of capacity
const weekdayLoad: DayLoad = { date: '2026-06-24', weatherStatus: 'OK', flights: [] }
const slotsWeekday = computeDaySlots(weekdayLoad, POLICY)
assert(classifyDate('2026-06-24', TODAY, slotsWeekday) === 'NOT_OPERATING',
  'a non-operating weekday classifies as NOT_OPERATING even with free capacity')

// Past date (same month, before TODAY) -> UNAVAILABLE
const pastDateLoad: DayLoad = { date: '2026-06-20', weatherStatus: 'OK', flights: [] }
const slotsPast = computeDaySlots(pastDateLoad, POLICY)
assert(classifyDate('2026-06-20', TODAY, slotsPast) === 'UNAVAILABLE',
  'a past date (even same month) classifies as UNAVAILABLE')

console.log('')
if (process.exitCode === 1) {
  console.log('❌ Some assertions FAILED.\n')
} else {
  console.log('✅ All assertions PASSED.\n')
}
