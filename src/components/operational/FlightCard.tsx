'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateFlight, deleteFlight as deleteFlightAction } from '@/lib/actions/flight'
import { ParticipantRow } from './ParticipantRow'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FlightWithParticipants, Instructor, FlightStatus } from '@/types/domain'

// STATUS_CONFIG uses token class names — no hex (Phase 1)
// Flight statuses map to the nearest semantic family
const STATUS_CONFIG: Record<FlightStatus, { label: string; className: string; dotClassName: string }> = {
  SCHEDULED: { label: 'Programado', className: 'bg-status-pending-bg text-status-pending',     dotClassName: 'bg-status-pending' },
  BOARDING:  { label: 'Embarcando', className: 'bg-status-checked-in-bg text-status-checked-in', dotClassName: 'bg-status-checked-in' },
  IN_AIR:    { label: 'En vuelo',   className: 'bg-state-info-bg text-state-info',              dotClassName: 'bg-state-info' },
  COMPLETED: { label: 'Completado', className: 'bg-status-completed-bg text-status-completed',  dotClassName: 'bg-status-completed' },
  DELAYED:   { label: 'Retrasado',  className: 'bg-status-briefed-bg text-status-briefed',      dotClassName: 'bg-status-briefed' },
  CANCELLED: { label: 'Cancelado',  className: 'bg-status-cancelled-bg text-status-cancelled',  dotClassName: 'bg-status-cancelled' },
}

// ─── ManifestColHead — column header row (lg+ only, inside FlightCard) ───────
// Rendered once per FlightCard when there are participants, before the rows.
// px-3.5 (FlightCard padding) + w-8 handle = offset; grid then starts after.
// Columns match --manifest-grid-cols: Participante|Estado|Paquete|Instructor|OW|Pago
export function ManifestColHead() {
  return (
    <div className="hidden lg:flex items-center px-3.5 border-b border-border bg-background/60">
      {/* Spacer for the drag handle — matches w-8 in ParticipantRow */}
      <div className="w-8 flex-shrink-0" />
      <div
        className="flex-1 min-w-0"
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--manifest-grid-cols)',
        }}
      >
        {(['Participante', 'Estado', 'Paquete', 'Instructor', 'OW', 'Pago'] as const).map(
          (col) => (
            <div
              key={col}
              className="py-[8px] px-3 text-[0.65625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground"
            >
              {col}
            </div>
          )
        )}
      </div>
      {/* Spacer for the delete button column — matches w-12 in ParticipantRow */}
      <div className="w-12 flex-shrink-0" />
    </div>
  )
}

interface FlightCardProps {
  flight: FlightWithParticipants
  instructors: Instructor[]
  onAddParticipant: () => void
  onDelete: () => void
}

export function FlightCard({ flight, instructors, onAddParticipant, onDelete }: FlightCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingTime, setEditingTime] = useState(false)
  const [time, setTime] = useState(flight.estimatedDepartureTime ?? '')

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: flight.id,
    data: { type: 'flight' },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${flight.id}`,
    data: { type: 'flight', flightId: flight.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const statusCfg = STATUS_CONFIG[flight.status]

  function handleTimeSave() {
    setEditingTime(false)
    const trimmed = time.trim() || null
    if (trimmed === flight.estimatedDepartureTime) return
    startTransition(async () => {
      const result = await updateFlight(flight.id, { estimatedDepartureTime: trimmed })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleStatusChange(status: FlightStatus) {
    startTransition(async () => {
      const result = await updateFlight(flight.id, { status })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`w-full rounded-[10px] border overflow-hidden transition-all ${
        isDragging
          ? 'opacity-50 border-primary/30 shadow-lg'
          : 'border-primary/20 shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:border-primary/45'
      }`}
    >
      {/* Header — slightly lighter than card body to create subtle depth */}
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2.5 ${flight.participants.length > 0 ? 'border-b border-border' : ''}`}
        style={{ background: 'oklch(0.991 0.003 55)' }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none flex items-center"
          style={{ opacity: 0.35 }}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
            <circle cx="3" cy="7"   r="1.2"/><circle cx="7" cy="7"   r="1.2"/>
            <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
          </svg>
        </button>

        {/* Flight number */}
        <span className="font-extrabold text-sm text-foreground flex-shrink-0" style={{ letterSpacing: '-0.3px' }}>
          #{flight.flightNumber}
        </span>

        <span className="text-border font-normal text-sm flex-shrink-0">·</span>

        {/* Time */}
        {editingTime ? (
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={handleTimeSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTimeSave()
              if (e.key === 'Escape') {
                setTime(flight.estimatedDepartureTime ?? '')
                setEditingTime(false)
              }
            }}
            className="bg-background border border-input rounded px-1 py-0 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 w-20 flex-shrink-0"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingTime(true)}
            className="text-sm text-muted-foreground font-medium hover:text-foreground hover:bg-secondary px-1 py-0.5 rounded transition-colors flex-shrink-0 tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {flight.estimatedDepartureTime ?? '-- : --'}
          </button>
        )}

        {/* Status badge — rounded-full pill, min 32px hit target */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full transition-colors min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${statusCfg.className}`}
          >
            {statusCfg.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.entries(STATUS_CONFIG) as [FlightStatus, typeof statusCfg][]).map(
              ([status, cfg]) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className="text-xs cursor-pointer"
                >
                  <span className={`inline-block w-2 h-2 rounded-sm mr-2 flex-shrink-0 opacity-70 ${cfg.dotClassName}`} />
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground flex-shrink-0">
          {flight.participants.length} {flight.participants.length === 1 ? 'participante' : 'participantes'}
        </span>

        {flight.isBackToBack && (
          <span className="flex-shrink-0 bg-secondary text-muted-foreground text-2xs px-2 py-0.5 rounded-full font-medium">
            Back-to-back
          </span>
        )}

        <div className="flex-1" />

        {/* + Añadir — Button outline */}
        <Button
          variant="outline"
          size="sm"
          onClick={onAddParticipant}
          className="flex-shrink-0"
        >
          + Añadir
        </Button>

        {/* ⋮ Options — bordered ghost */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center text-muted-foreground hover:text-foreground p-1.5 rounded-md border border-border bg-transparent transition-colors flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3.5" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="12.5" r="1.2"/>
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                startTransition(async () => {
                  const r = await updateFlight(flight.id, { isBackToBack: !flight.isBackToBack })
                  if (r.error) toast.error(r.error)
                  else router.refresh()
                })
              }
              className="cursor-pointer text-xs"
            >
              <Repeat size={12} className="mr-2" />
              {flight.isBackToBack ? 'Quitar back-to-back' : 'Marcar back-to-back'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive cursor-pointer text-xs"
            >
              <Trash2 size={12} className="mr-2" />
              Eliminar vuelo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Participants — flat rows with border-bottom, no individual cards */}
      <div
        ref={setDropRef}
        className={`transition-colors ${isOver ? 'bg-secondary/50 ring-1 ring-inset ring-primary/20' : 'bg-card'}`}
      >
        {flight.participants.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground/40 select-none">
            Suelta participantes aquí
          </div>
        ) : (
          <>
            {/* Column header — rendered once per flight card, lg+ only */}
            <ManifestColHead />
            {flight.participants.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                flightId={flight.id}
                instructors={instructors}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
