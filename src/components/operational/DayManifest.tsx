'use client'

import { useEffect, useId, useState, useTransition } from 'react'
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
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
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
  const dndId = useId()
  const [isPending, startTransition] = useTransition()
  const [flights, setFlights] = useState<FlightWithParticipants[]>(day.flights)
  const [addToFlightId, setAddToFlightId] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'flight' | 'participant' | null>(null)

  useEffect(() => {
    setFlights(day.flights)
  }, [day])

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
      const targetFlightId =
        (over.data.current?.flightId as string | undefined) ?? (over.id as string)

      if (!sourceFlightId || !targetFlightId || sourceFlightId === targetFlightId) return

      const targetFlight =
        flights.find((f) => f.id === targetFlightId) ??
        flights.find((f) => `drop-${f.id}` === targetFlightId)
      if (!targetFlight) return

      const resolvedTargetId = targetFlight.id
      const participantId = active.id as string

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
    // h-full fills the main area; flex-col so summary bar pins to bottom
    <div className="h-full flex flex-col">
      <DayHeader day={{ ...day, flights }} />

      {/* Scrollable flights area */}
      <div className="flex-1 overflow-y-auto">
        <DndContext
          id={dndId}
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flights.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2.5 px-7 py-5 max-w-[880px] mx-auto">
              {flights.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  instructors={instructors}
                  onAddParticipant={() => setAddToFlightId(flight.id)}
                  onDelete={() => handleDeleteFlight(flight.id)}
                />
              ))}

              <button
                onClick={handleAddFlight}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-1.5 py-3.5 rounded-[10px] border-2 border-dashed border-border hover:border-primary/30 hover:bg-secondary/40 hover:text-primary text-muted-foreground transition-all disabled:opacity-50 text-[13.5px] font-medium"
              >
                <Plus size={15} />
                Añadir vuelo
              </button>
            </div>
          </SortableContext>

          <DragOverlay>
            {dragType === 'flight' && (
              <div className="max-w-[880px] h-14 rounded-[10px] border border-primary/30 bg-card opacity-80 shadow-md" />
            )}
            {dragType === 'participant' && (
              <div className="h-9 rounded-md border border-primary/30 bg-card opacity-80 shadow-sm" />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Summary bar — flex-shrink-0 keeps it always visible at the bottom */}
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
