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
import { moveParticipant, swapParticipantFlights } from '@/lib/actions/participant'
import { DayHeader } from './DayHeader'
import { FlightCard } from './FlightCard'
import { AddParticipantDrawer } from './AddParticipantDrawer'
import { DayFinanceTab } from './DayFinanceTab'
import { useRealtimeManifest } from '@/hooks/useRealtimeManifest'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
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
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
  const [isSwapping, setIsSwapping] = useState(false)

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
      const times = flights
        .map((f) => f.estimatedDepartureTime)
        .filter((t): t is string => t !== null)
        .sort()
      const latest = times.at(-1)
      let estimatedDepartureTime: string | null = null
      if (latest) {
        const [h, m] = latest.split(':').map(Number)
        const next = h + 1
        if (next < 24) estimatedDepartureTime = `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
      const result = await createFlight(day.id, { estimatedDepartureTime })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleToggleParticipantSelect(id: string) {
    setSelectedParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleSwap() {
    const ids = Array.from(selectedParticipants)
    if (ids.length !== 2) return
    setIsSwapping(true)
    startTransition(async () => {
      const result = await swapParticipantFlights(ids[0], ids[1])
      setIsSwapping(false)
      if (result.error) {
        toast.error(result.error)
      } else {
        setSelectedParticipants(new Set())
        router.refresh()
      }
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
    // h-full fills the main area; flex-col layout
    <div className="h-full flex flex-col">
      <DayHeader day={{ ...day, flights }} />

      {/* Tabs — replaces manual tab bar with style inline */}
      <Tabs defaultValue="manifest" className="flex-1 flex flex-col overflow-hidden">
        <TabsList
          variant="line"
          className="flex-shrink-0 px-7 w-full rounded-none border-b border-border justify-start bg-card"
        >
          <TabsTrigger
            value="manifest"
            className="text-sm font-medium pb-[13px] pt-[14px] px-4 data-active:text-foreground data-active:font-semibold data-active:after:bg-primary"
          >
            Manifiesto
          </TabsTrigger>
          <TabsTrigger
            value="finanzas"
            className="text-sm font-medium pb-[13px] pt-[14px] px-4 data-active:text-foreground data-active:font-semibold data-active:after:bg-primary"
          >
            Finanzas
          </TabsTrigger>
        </TabsList>

        {/* Finance tab */}
        <TabsContent value="finanzas" className="flex-1 overflow-y-auto mt-0">
          <DayFinanceTab date={day.date} />
        </TabsContent>

        {/* Manifest tab: scrollable flights */}
        <TabsContent value="manifest" className="flex-1 flex flex-col overflow-hidden mt-0">
          {/* Selection action bar — sticky, appears when ≥1 participant selected */}
          {selectedParticipants.size > 0 && (
            <div className="flex-shrink-0 flex items-center gap-3 px-7 py-2.5 bg-secondary border-b border-border">
              <span className="text-sm text-muted-foreground">
                {selectedParticipants.size} {selectedParticipants.size === 1 ? 'seleccionado' : 'seleccionados'}
              </span>
              <button
                onClick={handleSwap}
                disabled={selectedParticipants.size !== 2 || isSwapping || isPending}
                className="text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {isSwapping ? 'Intercambiando…' : 'Intercambiar'}
              </button>
              <button
                onClick={() => setSelectedParticipants(new Set())}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                Cancelar
              </button>
            </div>
          )}
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
                      selectedParticipants={selectedParticipants}
                      onToggleParticipantSelect={handleToggleParticipantSelect}
                    />
                  ))}

                  <button
                    onClick={handleAddFlight}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-1.5 py-3.5 rounded-[10px] border-2 border-dashed border-border hover:border-primary/30 hover:bg-secondary/40 hover:text-primary text-muted-foreground transition-all disabled:opacity-50 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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

        </TabsContent>
      </Tabs>

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
