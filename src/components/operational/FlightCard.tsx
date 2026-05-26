'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateFlight, deleteFlight as deleteFlightAction } from '@/lib/actions/flight'
import { ParticipantRow } from './ParticipantRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FlightWithParticipants, Instructor, FlightStatus } from '@/types/domain'

const STATUS_CONFIG: Record<FlightStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Programado', className: 'bg-zinc-100 text-zinc-500' },
  BOARDING: { label: 'Embarcando', className: 'bg-blue-50 text-blue-600' },
  IN_AIR: { label: 'En vuelo', className: 'bg-sky-50 text-sky-600' },
  COMPLETED: { label: 'Completado', className: 'bg-emerald-50 text-emerald-600' },
  DELAYED: { label: 'Retrasado', className: 'bg-yellow-50 text-yellow-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-50 text-red-500' },
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
    const current = flight.estimatedDepartureTime
    if (trimmed === current) return
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
      className={`w-full flex flex-col rounded-xl border transition-all ${
        isDragging
          ? 'opacity-50 border-primary/40 bg-card shadow-lg'
          : 'border-border bg-card shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 touch-none"
        >
          <GripVertical size={14} />
        </button>

        {/* Flight number */}
        <span className="font-mono text-sm font-semibold text-foreground">
          #{flight.flightNumber}
        </span>

        <span className="text-muted-foreground/40 text-sm">·</span>

        {/* Time (inline edit) */}
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
            className="bg-background border border-input rounded px-1 py-0 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring w-20"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingTime(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:bg-secondary px-1 py-0.5 rounded transition-colors min-w-[44px]"
          >
            {flight.estimatedDepartureTime ?? '- - : - -'}
          </button>
        )}

        <span className="text-muted-foreground/40 text-sm">·</span>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${statusCfg.className} flex-shrink-0`}
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
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${cfg.className.split(' ')[0]}`} />
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground ml-1">
          {flight.participants.length} {flight.participants.length === 1 ? 'participante' : 'participantes'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {/* Add participant ghost button */}
          <button
            onClick={onAddParticipant}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:bg-secondary px-2 py-1 rounded-md transition-colors"
          >
            <Plus size={12} />
            Añadir
          </button>

          {/* Options dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded transition-colors">
              <MoreHorizontal size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </div>

      {/* Participants drop zone */}
      <div
        ref={setDropRef}
        className={`flex-1 px-3 py-2 space-y-1.5 min-h-[56px] rounded-b-xl transition-colors ${
          isOver ? 'bg-secondary/60 ring-1 ring-inset ring-primary/20' : ''
        } ${flight.participants.length === 0 ? 'flex items-center justify-center' : ''}`}
      >
        {flight.participants.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 select-none">Suelta participantes aquí</p>
        ) : (
          flight.participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              flightId={flight.id}
              instructors={instructors}
            />
          ))
        )}
      </div>
    </div>
  )
}
