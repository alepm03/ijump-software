'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { FlightStatus } from '@/types/domain'

export async function createFlight(
  dayId: string,
  data: { estimatedDepartureTime?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from('flights')
    .select('*', { count: 'exact', head: true })
    .eq('operational_day_id', dayId)

  if (countError) return { error: countError.message }

  const nextIndex = count ?? 0

  const { error } = await supabase.from('flights').insert({
    operational_day_id: dayId,
    flight_number: nextIndex + 1,
    order_index: nextIndex,
    estimated_departure_time: data.estimatedDepartureTime ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function updateFlight(
  id: string,
  data: {
    status?: FlightStatus
    estimatedDepartureTime?: string | null
    actualDepartureTime?: string | null
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('flights')
    .update({
      ...(data.status && { status: data.status }),
      ...(data.estimatedDepartureTime !== undefined && {
        estimated_departure_time: data.estimatedDepartureTime,
      }),
      ...(data.actualDepartureTime !== undefined && {
        actual_departure_time: data.actualDepartureTime,
      }),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function deleteFlight(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('flights').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function reorderFlights(
  orderedIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const updates = orderedIds.map((id, index) => ({
    id,
    order_index: index,
    // upsert requires all non-null columns; provide dummy values that will be ignored on conflict
    operational_day_id: '',
    flight_number: 0,
  }))

  // Use individual updates to avoid upsert constraint issues
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('flights').update({ order_index: index }).eq('id', id)
    )
  )

  const firstError = results.find((r) => r.error)
  if (firstError?.error) return { error: firstError.error.message }

  revalidatePath('/', 'layout')
  return {}
}
