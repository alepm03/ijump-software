'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  isOperatingDay,
  computeDaySlots,
  classifyDate,
} from '@/lib/availability/availability-engine'
import type {
  AvailabilityPolicy,
  DayLoad,
  DaySlots,
  DateClass,
} from '@/types/domain'
import type { Database } from '@/lib/supabase/database.types'
import { NON_COMPLETED_STATUSES } from '@/lib/finance/pnl-engine'

/** Both the cookie-based session client and the service client satisfy this. */
export type DbClient = SupabaseClient<Database>

const DEFAULT_POLICY: AvailabilityPolicy = {
  maxClientsPerFlight: 2,
  maxFlightsPerDay: 10,
  operatingWeekdays: [6, 0],
  flightIntervalMinutes: 60,
}

/** Today as YYYY-MM-DD in the center's timezone (Europe/Madrid). */
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

/** Reads business_settings and builds the policy the pure engine needs. */
export async function getPolicy(client?: DbClient): Promise<AvailabilityPolicy> {
  const supabase = client ?? (await createClient())
  const { data, error } = await supabase.from('business_settings').select('key, value')
  if (error) throw new Error(error.message)

  const settings = new Map(data?.map((row) => [row.key, row.value]) ?? [])

  const maxClientsPerFlight = Number(settings.get('max_clients_per_flight') ?? DEFAULT_POLICY.maxClientsPerFlight)
  const maxFlightsPerDay = Number(settings.get('max_flights_per_day') ?? DEFAULT_POLICY.maxFlightsPerDay)
  const operatingWeekdaysRaw = settings.get('operating_weekdays')
  const operatingWeekdays = operatingWeekdaysRaw
    ? operatingWeekdaysRaw.split(',').map((s) => Number(s.trim()))
    : DEFAULT_POLICY.operatingWeekdays
  const flightIntervalMinutes = Number(
    settings.get('flight_interval_minutes') ?? DEFAULT_POLICY.flightIntervalMinutes
  )

  return { maxClientsPerFlight, maxFlightsPerDay, operatingWeekdays, flightIntervalMinutes }
}

type RawDayRow = {
  weather_status: 'OK' | 'MARGINAL' | 'CANCELLED'
  flights: { id: string; participants: { id: string; operational_status: string }[] }[]
} | null

function buildDayLoad(date: string, row: RawDayRow): DayLoad {
  if (!row) {
    // No operational_day yet for this date — treat as an empty, fully-open day.
    return { date, weatherStatus: 'OK', flights: [] }
  }
  return {
    date,
    weatherStatus: row.weather_status,
    flights: row.flights.map((f) => ({
      id: f.id,
      activeParticipantCount: f.participants.filter(
        (p) => !NON_COMPLETED_STATUSES.has(p.operational_status)
      ).length,
    })),
  }
}

/** Availability breakdown for a single day. A day without an operational_day row is treated as empty/open. */
export async function getDayAvailability(date: string, client?: DbClient): Promise<DaySlots> {
  const supabase = client ?? (await createClient())
  const policy = await getPolicy(client)

  const { data, error } = await supabase
    .from('operational_days')
    .select('weather_status, flights ( id, participants ( id, operational_status ) )')
    .eq('date', date)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const load = buildDayLoad(date, data as RawDayRow)
  return computeDaySlots(load, policy)
}

/** Availability + classification for every day in a given month (YYYY-MM). */
export async function getMonthAvailability(
  yearMonth: string
): Promise<{ date: string; slots: DaySlots; classification: DateClass }[]> {
  const supabase = await createClient()
  const policy = await getPolicy()
  const today = todayIso()

  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    const monthStr = String(month).padStart(2, '0')
    return `${year}-${monthStr}-${day}`
  })

  const { data, error } = await supabase
    .from('operational_days')
    .select('date, weather_status, flights ( id, participants ( id, operational_status ) )')
    .gte('date', dates[0])
    .lte('date', dates[dates.length - 1])

  if (error) throw new Error(error.message)

  const rowsByDate = new Map((data ?? []).map((row) => [row.date, row]))

  return dates.map((date) => {
    // Skip non-operating weekdays entirely if not even worth computing? Still compute for consistency.
    if (!isOperatingDay(date, policy)) {
      const slots = computeDaySlots({ date, weatherStatus: 'OK', flights: [] }, policy)
      return { date, slots, classification: classifyDate(date, today, slots) }
    }
    const row = rowsByDate.get(date) ?? null
    const load = buildDayLoad(date, row as RawDayRow)
    const slots = computeDaySlots(load, policy)
    return { date, slots, classification: classifyDate(date, today, slots) }
  })
}

/** Walks forward from `fromDate` looking for the next `limit` bookable operating days. */
export async function listNextAvailableSlots(
  params: {
    fromDate?: string
    limit?: number
    maxDaysToScan?: number
  },
  client?: DbClient
): Promise<{ date: string; slots: DaySlots; classification: DateClass }[]> {
  const { fromDate, limit = 6, maxDaysToScan = 120 } = params
  const policy = await getPolicy(client)
  const today = todayIso()
  const startDate = fromDate ?? today

  const results: { date: string; slots: DaySlots; classification: DateClass }[] = []
  const cursor = new Date(`${startDate}T00:00:00Z`)

  for (let i = 0; i < maxDaysToScan && results.length < limit; i++) {
    const date = cursor.toISOString().slice(0, 10)
    if (isOperatingDay(date, policy)) {
      const slots = await getDayAvailability(date, client)
      if (slots.bookable) {
        results.push({ date, slots, classification: classifyDate(date, today, slots) })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return results
}
