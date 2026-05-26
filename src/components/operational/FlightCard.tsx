'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateFlight, deleteFlight as deleteFlightAction } from '@/lib/actions/flight'
import { ParticipantRow } from './ParticipantRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FlightWithParticipants, Instructor, FlightStatus } from '@/types/domain'

const STATUS_CONFIG: Record<FlightStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Programado', className: 'bg-zinc-700 text-zinc-300' },
  BOARDING: { label: 'Embarcando', className: 'bg-blue-900 text-blue-300' },
  IN_AIR: { label: 'En vuelo', className: 'bg-sky-900 text-sky-300' },
  COMPLETED: { label: 'Completado', className: 'bg-emerald-900 text-emerald-300' },
  DELAYED: { label: 'Retrasado', className: 'bg-yellow-900 text-yellow-300' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-950 text-red-400' },
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sortable for flight reordering
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

  // Droppable zone for participant drops
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

  function handleDelete() {
    setConfirmDelete(false)
    onDelete()
  }

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`w-72 flex-shrink-0 flex flex-col rounded-xl border transition-all ${
        isDragging
          ? 'opacity-50 border-sky-600 bg-zinc-800'
          : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 flex-shrink-0 touch-none"
        >
          <GripVertical size={14} />
        </button>

        {/* Flight number */}
        <span className="font-mono text-sm font-semibold text-zinc-100">
          #{flight.flightNumber}
        </span>

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
            className="bg-zinc-700 border border-zinc-600 rounded px-1 py-0 text-xs text-white outline-none focus:ring-1 focus:ring-sky-500 w-20"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingTime(true)}
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-1 py-0.5 rounded transition-colors min-w-[44px]"
          >
            {flight.estimatedDepartureTime ?? '- - : - -'}
          </button>
        )}

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${statusCfg.className} flex-shrink-0`}
          >
            {statusCfg.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
            {(Object.entries(STATUS_CONFIG) as [FlightStatus, typeof statusCfg][]).map(
              ([status, cfg]) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`text-xs cursor-pointer ${cfg.className}`}
                >
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete */}
        <div className="flex-shrink-0 ml-1">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Sí
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-zinc-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Participants drop zone */}
      <div
        ref={setDropRef}
        className={`flex-1 p-2 space-y-1.5 min-h-[64px] rounded-b-xl transition-colors ${
          isOver ? 'bg-sky-950/30 ring-1 ring-inset ring-sky-800' : ''
        }`}
      >
        {flight.participants.map((participant) => (
          <ParticipantRow
            key={participant.id}
            participant={participant}
            flightId={flight.id}
            instructors={instructors}
          />
        ))}
      </div>

      {/* Add participant */}
      <button
        onClick={onAddParticipant}
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 border-t border-zinc-800 rounded-b-xl transition-colors"
      >
        <Plus size={13} />
        Añadir participante
      </button>
    </div>
  )
}
