'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/supabase/database.types'
import type {
  OperationalDay,
  OperationalDaySummary,
  OperationalDayWithDetails,
  FlightWithParticipants,
  ParticipantWithDetails,
  WeatherStatus,
} from '@/types/domain'

export async function getOperationalDays(): Promise<OperationalDay[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('operational_days')
    .select('*')
    .order('date', { ascending: false })

  if (error) throw new Error(error.message)

  return data.map((row) => ({
    id: row.id,
    date: row.date,
    weatherStatus: row.weather_status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function getOperationalDay(
  date: string
): Promise<OperationalDayWithDetails | null> {
  const supabase = await createClient()

  const { data: day, error: dayError } = await supabase
    .from('operational_days')
    .select('*')
    .eq('date', date)
    .single()

  if (dayError) {
    if (dayError.code === 'PGRST116') return null
    throw new Error(dayError.message)
  }

  const { data: flights, error: flightsError } = await supabase
    .from('flights')
    .select('*')
    .eq('operational_day_id', day.id)
    .order('order_index')

  if (flightsError) throw new Error(flightsError.message)

  if (!flights?.length) {
    return {
      id: day.id,
      date: day.date,
      weatherStatus: day.weather_status,
      notes: day.notes,
      createdAt: day.created_at,
      updatedAt: day.updated_at,
      flights: [],
    }
  }

  const flightIds = flights.map((f) => f.id)

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('*')
    .in('flight_id', flightIds)

  if (participantsError) throw new Error(participantsError.message)

  const activeParticipants = participants ?? []
  const participantIds = activeParticipants.map((p) => p.id)

  const instructorIds = [
    ...new Set(
      activeParticipants.map((p) => p.assigned_instructor_id).filter(Boolean)
    ),
  ] as string[]

  const groupIds = [
    ...new Set(
      activeParticipants.map((p) => p.reservation_group_id).filter(Boolean)
    ),
  ] as string[]

  const [instructorsResult, paymentsResult, groupsResult] = await Promise.all([
    instructorIds.length
      ? supabase.from('instructors').select('*').in('id', instructorIds)
      : Promise.resolve({ data: [] as Tables<'instructors'>[], error: null }),
    participantIds.length
      ? supabase.from('payments').select('*').in('participant_id', participantIds)
      : Promise.resolve({ data: [] as Tables<'payments'>[], error: null }),
    groupIds.length
      ? supabase.from('reservation_groups').select('*').in('id', groupIds)
      : Promise.resolve({ data: [] as Tables<'reservation_groups'>[], error: null }),
  ])

  if (instructorsResult.error) throw new Error(instructorsResult.error.message)
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)
  if (groupsResult.error) throw new Error(groupsResult.error.message)

  const instructorsMap = new Map(
    (instructorsResult.data ?? []).map((i) => [i.id, i])
  )
  const groupsMap = new Map(
    (groupsResult.data ?? []).map((g) => [g.id, g])
  )

  const paymentsByParticipant = new Map<string, typeof paymentsResult.data>()
  for (const pmt of paymentsResult.data ?? []) {
    const list = paymentsByParticipant.get(pmt.participant_id) ?? []
    list.push(pmt)
    paymentsByParticipant.set(pmt.participant_id, list)
  }

  const participantsByFlight = new Map<string, typeof activeParticipants>()
  for (const p of activeParticipants) {
    if (!p.flight_id) continue
    const list = participantsByFlight.get(p.flight_id) ?? []
    list.push(p)
    participantsByFlight.set(p.flight_id, list)
  }

  const mappedFlights: FlightWithParticipants[] = flights.map((f) => ({
    id: f.id,
    operationalDayId: f.operational_day_id,
    flightNumber: f.flight_number,
    estimatedDepartureTime: f.estimated_departure_time,
    actualDepartureTime: f.actual_departure_time,
    status: f.status,
    orderIndex: f.order_index,
    createdAt: f.created_at,
    participants: (participantsByFlight.get(f.id) ?? []).map(
      (p): ParticipantWithDetails => {
        const instructor = p.assigned_instructor_id
          ? (instructorsMap.get(p.assigned_instructor_id) ?? null)
          : null
        const group = p.reservation_group_id
          ? (groupsMap.get(p.reservation_group_id) ?? null)
          : null
        return {
          id: p.id,
          flightId: p.flight_id,
          reservationGroupId: p.reservation_group_id,
          assignedInstructorId: p.assigned_instructor_id,
          fullName: p.full_name,
          phone: p.phone,
          email: p.email,
          packageType: p.package_type,
          weight: p.weight,
          overweightFee: p.overweight_fee,
          operationalStatus: p.operational_status,
          waiverSigned: p.waiver_signed,
          checkInCompleted: p.check_in_completed,
          gearedUp: p.geared_up,
          notes: p.notes,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          instructor: instructor
            ? {
                id: instructor.id,
                name: instructor.name,
                active: instructor.active,
                createdAt: instructor.created_at,
              }
            : null,
          payments: (paymentsByParticipant.get(p.id) ?? []).map((pmt) => ({
            id: pmt.id,
            participantId: pmt.participant_id,
            amount: pmt.amount,
            method: pmt.method,
            stage: pmt.stage,
            notes: pmt.notes,
            createdAt: pmt.created_at,
          })),
          reservationGroup: group
            ? {
                id: group.id,
                payerName: group.payer_name,
                source: group.source,
                notes: group.notes,
                createdAt: group.created_at,
              }
            : null,
        }
      }
    ),
  }))

  return {
    id: day.id,
    date: day.date,
    weatherStatus: day.weather_status,
    notes: day.notes,
    createdAt: day.created_at,
    updatedAt: day.updated_at,
    flights: mappedFlights,
  }
}

export async function getOperationalDaysWithStats(
  from: string,
  to: string
): Promise<OperationalDaySummary[]> {
  const supabase = await createClient()

  const { data: days, error: daysError } = await supabase
    .from('operational_days')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (daysError) throw new Error(daysError.message)
  if (!days?.length) return []

  const dayIds = days.map((d) => d.id)

  const { data: flights, error: flightsError } = await supabase
    .from('flights')
    .select('id, operational_day_id')
    .in('operational_day_id', dayIds)

  if (flightsError) throw new Error(flightsError.message)

  const flightIds = (flights ?? []).map((f) => f.id)

  const { data: participants, error: participantsError } = flightIds.length
    ? await supabase
        .from('participants')
        .select('flight_id')
        .in('flight_id', flightIds)
    : { data: [] as { flight_id: string | null }[], error: null }

  if (participantsError) throw new Error(participantsError.message)

  const flightsByDay = new Map<string, number>()
  for (const f of flights ?? []) {
    flightsByDay.set(f.operational_day_id, (flightsByDay.get(f.operational_day_id) ?? 0) + 1)
  }

  const jumpsByFlight = new Map<string, number>()
  for (const p of participants ?? []) {
    if (!p.flight_id) continue
    jumpsByFlight.set(p.flight_id, (jumpsByFlight.get(p.flight_id) ?? 0) + 1)
  }

  const jumpsByDay = new Map<string, number>()
  for (const f of flights ?? []) {
    const count = jumpsByFlight.get(f.id) ?? 0
    jumpsByDay.set(f.operational_day_id, (jumpsByDay.get(f.operational_day_id) ?? 0) + count)
  }

  return days.map((d) => ({
    id: d.id,
    date: d.date,
    weatherStatus: d.weather_status,
    notes: d.notes,
    flightCount: flightsByDay.get(d.id) ?? 0,
    jumpCount: jumpsByDay.get(d.id) ?? 0,
  }))
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function createOperationalDay(
  date: string,
  startTime: string
): Promise<{ error?: string; date?: string }> {
  const supabase = await createClient()

  const { data: day, error } = await supabase
    .from('operational_days')
    .insert({ date })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Ya existe una jornada para esa fecha.' }
    return { error: error.message }
  }

  const flights = Array.from({ length: 5 }, (_, i) => ({
    operational_day_id: day.id,
    flight_number: i + 1,
    order_index: i,
    estimated_departure_time: addHours(startTime, i),
  }))

  const { error: flightsError } = await supabase.from('flights').insert(flights)
  if (flightsError) return { error: flightsError.message }

  revalidatePath('/')
  return { date }
}

export async function updateOperationalDay(
  id: string,
  data: { weatherStatus?: WeatherStatus; notes?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('operational_days')
    .update({
      ...(data.weatherStatus && { weather_status: data.weatherStatus }),
      ...(data.notes !== undefined && { notes: data.notes }),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
