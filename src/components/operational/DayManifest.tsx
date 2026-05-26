'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { reorderFlights, createFlight, deleteFlight } from '@/lib/actions/flight'
import { moveParticipant } from '@/lib/actions/participant'
import { DayHeader } from './DayHeader'
import { FlightCard } from './FlightCard'
import { DailySummaryPanel } from './DailySummaryPanel'
import { AddParticipantDrawer } from './AddParticipantDrawer'
import { useRealtimeManifest } from '@/hooks/useRealtimeManifest'
import type { FlightWithParticipants, Instructor, OperationalDayWithDetails } from '@/types/domain'

interface DayManifestProps {
  day: OperationalDayWithDetails
  instructors: Instructor[]
}

export function DayManifest({ day, instructors }: DayManifestProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [flights, setFlights] = useState<FlightWithParticipants[]>(day.flights)
  const [addToFlightId, setAddToFlightId] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'flight' | 'participant' | null>(null)

  // Sync with incoming props (from router.refresh)
  useEffect(() => {
    setFlights(day.flights)
  }, [day])

  // Realtime sync
  useRealtimeManifest(day.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    setDragType(event.active.data.current?.type ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragType(null)
    const { active, over } = event
    if (!over) return

    const activeType = active.data.current?.type

    if (activeType === 'flight') {
      const oldIdx = flights.findIndex((f) => f.id === active.id)
      const newIdx = flights.findIndex((f) => f.id === over.id)
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

      const reordered = arrayMove(flights, oldIdx, newIdx)
      setFlights(reordered)

      startTransition(async () => {
        const result = await reorderFlights(reordered.map((f) => f.id))
        if (result.error) {
          toast.error(result.error)
          setFlights(day.flights)
        } else {
          router.refresh()
        }
      })
      return
    }

    if (activeType === 'participant') {
      const sourceFlightId = active.data.current?.flightId as string | undefined
      // over could be a flight sortable or a flight droppable zone
      const targetFlightId =
        (over.data.current?.flightId as string | undefined) ?? (over.id as string)

      if (!sourceFlightId || !targetFlightId || sourceFlightId === targetFlightId) return

      // Validate target is actually a flight
      const targetFlight =
        flights.find((f) => f.id === targetFlightId) ??
        flights.find((f) => `drop-${f.id}` === targetFlightId)
      if (!targetFlight) return

      const resolvedTargetId = targetFlight.id
      const participantId = active.id as string

      // Optimistic update
      const participant = flights
        .flatMap((f) => f.participants)
        .find((p) => p.id === participantId)
      if (!participant) return

      setFlights((prev) =>
        prev.map((f) => {
          if (f.id === sourceFlightId) {
            return { ...f, participants: f.participants.filter((p) => p.id !== participantId) }
          }
          if (f.id === resolvedTargetId) {
            return {
              ...f,
              participants: [...f.participants, { ...participant, flightId: resolvedTargetId }],
            }
          }
          return f
        })
      )

      startTransition(async () => {
        const result = await moveParticipant(participantId, resolvedTargetId)
        if (result.error) {
          toast.error(result.error)
          setFlights(day.flights)
        } else {
          router.refresh()
        }
      })
    }
  }

  function handleAddFlight() {
    startTransition(async () => {
      const result = await createFlight(day.id, {})
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleDeleteFlight(flightId: string) {
    setFlights((prev) => prev.filter((f) => f.id !== flightId))
    startTransition(async () => {
      const result = await deleteFlight(flightId)
      if (result.error) {
        toast.error(result.error)
        setFlights(day.flights)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DayHeader day={{ ...day, flights }} />

      {/* Manifest board */}
      <div className="flex-1 overflow-x-auto">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flights.map((f) => f.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-4 p-4 items-start min-w-max">
              {flights.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  instructors={instructors}
                  onAddParticipant={() => setAddToFlightId(flight.id)}
                  onDelete={() => handleDeleteFlight(flight.id)}
                />
              ))}

              {/* Add flight button */}
              <button
                onClick={handleAddFlight}
                disabled={isPending}
                className="flex-shrink-0 w-72 min-h-[120px] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                <Plus size={20} />
                <span className="text-sm">Añadir vuelo</span>
              </button>
            </div>
          </SortableContext>

          {/* Drag overlay — minimal ghost */}
          <DragOverlay>
            {dragType === 'flight' && (
              <div className="w-72 h-16 rounded-xl border border-sky-600 bg-zinc-800 opacity-80" />
            )}
            {dragType === 'participant' && (
              <div className="w-64 h-10 rounded-lg border border-sky-600 bg-zinc-700 opacity-80" />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <DailySummaryPanel flights={flights} />

      <AddParticipantDrawer
        flightId={addToFlightId}
        instructors={instructors}
        onClose={() => setAddToFlightId(null)}
        onSuccess={() => {
          setAddToFlightId(null)
          router.refresh()
        }}
      />
    </div>
  )
}
