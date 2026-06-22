'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  OperationalDay,
  OperationalDaySummary,
  OperationalDayWithDetails,
  FlightWithParticipants,
  ParticipantWithDetails,
  WeatherStatus,
  LeadStatus,
  Channel,
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

  const { data, error } = await supabase
    .from('operational_days')
    .select(`
      *,
      flights (
        *,
        participants (
          *,
          instructor:instructors!participants_assigned_instructor_id_fkey (*),
          reservation_group:reservation_groups!participants_reservation_group_id_fkey (*),
          payments (*)
        )
      )
    `)
    .eq('date', date)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  const flights = (data.flights ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)

  const mappedFlights: FlightWithParticipants[] = flights.map((f) => ({
    id: f.id,
    operationalDayId: f.operational_day_id,
    flightNumber: f.flight_number,
    estimatedDepartureTime: f.estimated_departure_time,
    actualDepartureTime: f.actual_departure_time,
    status: f.status,
    orderIndex: f.order_index,
    createdAt: f.created_at,
    participants: (f.participants ?? []).map((p): ParticipantWithDetails => ({
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
      leadStatus: p.lead_status as LeadStatus | null,
      preferredDate: p.preferred_date,
      preferredTime: p.preferred_time,
      confirmedDate: p.confirmed_date,
      confirmedTime: p.confirmed_time,
      depositPaid: p.deposit_paid,
      channel: p.channel as Channel,
      createdBy: p.created_by,
      token: p.token,
      instructor: p.instructor
        ? { id: p.instructor.id, name: p.instructor.name, active: p.instructor.active, feePerJump: p.instructor.fee_per_jump, createdAt: p.instructor.created_at }
        : null,
      payments: (p.payments ?? []).map((pmt) => ({
        id: pmt.id,
        participantId: pmt.participant_id,
        amount: pmt.amount,
        method: pmt.method,
        stage: pmt.stage,
        notes: pmt.notes,
        createdAt: pmt.created_at,
      })),
      reservationGroup: p.reservation_group
        ? {
            id: p.reservation_group.id,
            payerName: p.reservation_group.payer_name,
            source: p.reservation_group.source,
            notes: p.reservation_group.notes,
            createdAt: p.reservation_group.created_at,
            contactPhone: p.reservation_group.contact_phone,
            contactEmail: p.reservation_group.contact_email,
            channel: p.reservation_group.channel as Channel,
            createdBy: p.reservation_group.created_by,
          }
        : null,
    })),
  }))

  return {
    id: data.id,
    date: data.date,
    weatherStatus: data.weather_status,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    flights: mappedFlights,
  }
}

export async function getOperationalDaysWithStats(
  from: string,
  to: string
): Promise<OperationalDaySummary[]> {
  const supabase = await createClient()

    const { data, error } = await supabase
      .from('operational_days')
      .select(`
        *,
        flights (
          id,
          participants (id)
        )
      `)
      .gte('date', from)
      .lte('date', to)
      .order('date')

    if (error) throw new Error(error.message)
    if (!data?.length) return []

    return data.map((d) => ({
      id: d.id,
      date: d.date,
      weatherStatus: d.weather_status,
      notes: d.notes,
      flightCount: d.flights?.length ?? 0,
      jumpCount: d.flights?.reduce((acc, f) => acc + (f.participants?.length ?? 0), 0) ?? 0,
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
