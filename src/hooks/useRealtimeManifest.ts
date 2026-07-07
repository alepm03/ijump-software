'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Postgres-changes payloads only guarantee the primary key in `old` (REPLICA
 * IDENTITY DEFAULT), so relevance checks use `new` when present and fall back
 * to `old.id` membership in the day's known ids.
 */
type ChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

export function useRealtimeManifest(
  dayId: string,
  flightIds: string[],
  participantIds: string[]
) {
  const router = useRouter()

  // Refs so the subscription survives id-list changes without resubscribing:
  // events are filtered client-side against the latest lists.
  const flightIdsRef = useRef<Set<string>>(new Set(flightIds))
  const participantIdsRef = useRef<Set<string>>(new Set(participantIds))
  flightIdsRef.current = new Set(flightIds)
  participantIdsRef.current = new Set(participantIds)

  useEffect(() => {
    const supabase = createClient()

    // A single mutation often touches participant + payment + items in quick
    // succession; coalesce into one refresh instead of 2-3 full re-renders.
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 300)
    }

    const participantConcernsDay = (p: ChangePayload) => {
      const flightId = p.new?.flight_id
      if (typeof flightId === 'string' && flightIdsRef.current.has(flightId)) return true
      // Covers moves OUT of this day and DELETEs (old only carries the PK).
      const oldId = p.old?.id
      return typeof oldId === 'string' && participantIdsRef.current.has(oldId)
    }

    const paymentConcernsDay = (p: ChangePayload) => {
      const participantId = p.new?.participant_id
      if (typeof participantId === 'string' && participantIdsRef.current.has(participantId))
        return true
      // DELETE payloads only carry the payment's own id — can't attribute it
      // to a participant, so refresh conservatively (deletes are rare).
      return p.eventType === 'DELETE'
    }

    const channel = supabase
      .channel(`manifest-${dayId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operational_days', filter: `id=eq.${dayId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flights', filter: `operational_day_id=eq.${dayId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          if (participantConcernsDay(payload as unknown as ChangePayload)) scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        (payload) => {
          if (paymentConcernsDay(payload as unknown as ChangePayload)) scheduleRefresh()
        }
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [dayId, router])
}
