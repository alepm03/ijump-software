'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateParticipant, deleteParticipant } from '@/lib/actions/participant'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ParticipantWithDetails, Instructor, OperationalStatus, PackageType } from '@/types/domain'

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OperationalStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-zinc-100 text-zinc-500' },
  CHECKED_IN: { label: 'Check-in', className: 'bg-blue-50 text-blue-600' },
  WAIVER_SIGNED: { label: 'Waiver', className: 'bg-purple-50 text-purple-600' },
  BRIEFED: { label: 'Briefed', className: 'bg-yellow-50 text-yellow-700' },
  GEARED_UP: { label: 'Equipado', className: 'bg-orange-50 text-orange-600' },
  READY: { label: 'Listo', className: 'bg-green-50 text-green-600' },
  COMPLETED: { label: 'Completado', className: 'bg-emerald-50 text-emerald-600' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-50 text-red-500' },
  NO_SHOW: { label: 'No show', className: 'bg-red-50 text-red-500' },
  WEATHER_CANCELLED: { label: 'Wx cancel.', className: 'bg-red-50 text-red-500' },
}

const PACKAGE_CONFIG: Record<PackageType, { label: string; className: string }> = {
  SOLO: { label: 'Solo', className: 'bg-zinc-100 text-zinc-500' },
  HANDYCAM: { label: 'HC', className: 'bg-blue-50 text-blue-600' },
  VIDEO_EXTERNO: { label: 'VE', className: 'bg-indigo-50 text-indigo-600' },
  FOTOS: { label: 'Fotos', className: 'bg-teal-50 text-teal-600' },
  HANDYCAM_FOTOS: { label: 'HC+F', className: 'bg-blue-50 text-blue-600' },
}

// ─── Inline editable text field ─────────────────────────────────────────────

function InlineField({
  value,
  placeholder,
  onSave,
  inputType = 'text',
  className = '',
}: {
  value: string
  placeholder: string
  onSave: (v: string) => void
  inputType?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={inputType}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={`bg-background border border-input rounded px-1 py-0 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring min-w-0 ${className}`}
        autoFocus
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-text hover:bg-secondary/60 rounded px-1 py-0.5 text-xs transition-colors ${
        value ? 'text-foreground' : 'text-muted-foreground/50'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}

// ─── Toggle button ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  label,
  activeClass,
  onClick,
  disabled,
}: {
  checked: boolean
  label: string
  activeClass: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold border transition-colors ${
        checked
          ? `${activeClass} border-transparent`
          : 'bg-transparent border-border text-muted-foreground/50 hover:border-border hover:text-muted-foreground'
      }`}
    >
      {checked ? <Check size={9} /> : label[0]}
    </button>
  )
}

// ─── ParticipantRow ───────────────────────────────────────────────────────────

interface ParticipantRowProps {
  participant: ParticipantWithDetails
  flightId: string
  instructors: Instructor[]
}

export function ParticipantRow({ participant: p, flightId, instructors }: ParticipantRowProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: p.id,
    data: { type: 'participant', flightId },
  })

  function save(data: Parameters<typeof updateParticipant>[1]) {
    startTransition(async () => {
      const result = await updateParticipant(p.id, data)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteParticipant(p.id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  const statusCfg = STATUS_CONFIG[p.operationalStatus]
  const pkgCfg = PACKAGE_CONFIG[p.packageType]

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`bg-background rounded-lg border transition-all ${
        isDragging ? 'border-primary/40 shadow-sm' : 'border-border/70 hover:border-border hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-1 p-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground pt-0.5 flex-shrink-0 touch-none"
        >
          <GripVertical size={12} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Row 1: Name + Status */}
          <div className="flex items-center gap-1">
            <InlineField
              value={p.fullName}
              placeholder="Nombre"
              onSave={(v) => save({ fullName: v })}
              className="flex-1 font-medium"
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isPending}
                className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${statusCfg.className}`}
              >
                {statusCfg.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {(Object.entries(STATUS_CONFIG) as [OperationalStatus, typeof statusCfg][]).map(
                  ([status, cfg]) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => save({ operationalStatus: status })}
                      className="text-xs cursor-pointer"
                    >
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${cfg.className.split(' ')[0]}`} />
                      {cfg.label}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Row 2: Package + Instructor + Toggles + Weight */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Package */}
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isPending}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${pkgCfg.className}`}
              >
                {pkgCfg.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(Object.entries(PACKAGE_CONFIG) as [PackageType, typeof pkgCfg][]).map(
                  ([pkg, cfg]) => (
                    <DropdownMenuItem
                      key={pkg}
                      onClick={() => save({ packageType: pkg })}
                      className="text-xs cursor-pointer"
                    >
                      {cfg.label}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Instructor */}
            <Select
              value={p.assignedInstructorId ?? ''}
              onValueChange={(v) => save({ assignedInstructorId: v || null })}
              disabled={isPending}
            >
              <SelectTrigger className="h-5 text-[10px] px-1.5 py-0 min-w-[80px] max-w-[100px]">
                <SelectValue placeholder="Instructor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="" className="text-muted-foreground text-xs">
                  —
                </SelectItem>
                {instructors
                  .filter((i) => i.active)
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">
                      {i.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {/* Toggles: Waiver / Check-in / Geared */}
            <div className="flex items-center gap-0.5">
              <Toggle
                checked={p.waiverSigned}
                label="Waiver"
                activeClass="bg-purple-50 text-purple-600"
                onClick={() => save({ waiverSigned: !p.waiverSigned })}
                disabled={isPending}
              />
              <Toggle
                checked={p.checkInCompleted}
                label="Check-in"
                activeClass="bg-blue-50 text-blue-600"
                onClick={() => save({ checkInCompleted: !p.checkInCompleted })}
                disabled={isPending}
              />
              <Toggle
                checked={p.gearedUp}
                label="Geared"
                activeClass="bg-orange-50 text-orange-600"
                onClick={() => save({ gearedUp: !p.gearedUp })}
                disabled={isPending}
              />
            </div>

            {/* Weight */}
            <InlineField
              value={p.weight ? String(p.weight) : ''}
              placeholder="kg"
              onSave={(v) => {
                const n = parseFloat(v)
                save({ weight: isNaN(n) ? null : n })
              }}
              inputType="number"
              className="w-10 text-center"
            />
          </div>
        </div>

        {/* Delete */}
        <div className="flex-shrink-0 flex items-center pt-0.5">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-[10px] text-destructive hover:text-destructive/80 px-1"
              >
                Sí
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
