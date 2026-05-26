'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { updateParticipant, deleteParticipant } from '@/lib/actions/participant'
import { createPayment, updatePayment, deletePayment } from '@/lib/actions/payment'
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
import type {
  ParticipantWithDetails,
  Instructor,
  OperationalStatus,
  PackageType,
  PaymentMethod,
  PaymentStage,
  Payment,
} from '@/types/domain'

// ─── Status / Package config ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<OperationalStatus, { label: string; bg: string; color: string }> = {
  PENDING:          { label: 'Pendiente',  bg: '#F4F4F5', color: '#71717A' },
  CHECKED_IN:       { label: 'Check-in',  bg: '#EFF6FF', color: '#3B82F6' },
  WAIVER_SIGNED:    { label: 'Waiver',    bg: '#FAF5FF', color: '#9333EA' },
  BRIEFED:          { label: 'Briefed',   bg: '#FEFCE8', color: '#CA8A04' },
  GEARED_UP:        { label: 'Equipado',  bg: '#FFF7ED', color: '#EA580C' },
  READY:            { label: 'Listo',     bg: '#F0FDF4', color: '#16A34A' },
  COMPLETED:        { label: 'Completado',bg: '#ECFDF5', color: '#059669' },
  CANCELLED:        { label: 'Cancelado', bg: '#FFF1F2', color: '#E11D48' },
  NO_SHOW:          { label: 'No show',   bg: '#FFF1F2', color: '#E11D48' },
  WEATHER_CANCELLED:{ label: 'Wx cancel.',bg: '#FFF1F2', color: '#E11D48' },
}

const PACKAGE_CONFIG: Record<PackageType, { label: string; bg: string; color: string }> = {
  SOLO:           { label: 'Solo',  bg: '#F4F4F5', color: '#71717A' },
  HANDYCAM:       { label: 'HC',   bg: '#EFF6FF', color: '#3B82F6' },
  VIDEO_EXTERNO:  { label: 'VE',   bg: '#EEF2FF', color: '#6366F1' },
  FOTOS:          { label: 'Fotos',bg: '#F0FDFA', color: '#0D9488' },
  HANDYCAM_FOTOS: { label: 'HC+F', bg: '#EFF6FF', color: '#3B82F6' },
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transfer.',
  GROUPON: 'Groupon',
}

const TOGGLE_CONFIG = [
  { key: 'waiverSigned',     label: 'W', bg: '#FAF5FF', color: '#9333EA' },
  { key: 'checkInCompleted', label: 'C', bg: '#EFF6FF', color: '#3B82F6' },
  { key: 'gearedUp',         label: 'G', bg: '#FFF7ED', color: '#EA580C' },
] as const

// ─── Inline editable field ────────────────────────────────────────────────────

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
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
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
        value ? 'text-foreground' : 'text-muted-foreground/40'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}

// ─── Payment cell ─────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<PaymentStage, string> = {
  RESERVA: 'Reserva',
  LIQUIDACION: 'Liquid.',
  SUPLEMENTO: 'Supl.',
}

const STAGE_COLORS: Record<PaymentStage, string> = {
  RESERVA: '#6366F1',
  LIQUIDACION: '#059669',
  SUPLEMENTO: '#EA580C',
}

function PaymentPill({
  payment,
  onDelete,
}: {
  payment: Payment
  onDelete: () => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(payment.amount))
  const [isPending, startTransition] = useTransition()

  function commit() {
    const n = parseFloat(draft)
    if (!isNaN(n) && n > 0 && n !== payment.amount) {
      startTransition(async () => {
        const result = await updatePayment(payment.id, { amount: n })
        if (result.error) toast.error(result.error)
        else router.refresh()
      })
    }
    setEditing(false)
  }

  const color = STAGE_COLORS[payment.stage]

  if (editing) {
    return (
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(String(payment.amount)); setEditing(false) }
        }}
        className="w-14 text-xs bg-background border border-input rounded px-1 py-0 text-foreground outline-none focus:ring-1 focus:ring-ring"
        autoFocus
      />
    )
  }

  return (
    <span className="flex items-center gap-0.5 group">
      <button
        onClick={() => setEditing(true)}
        title={`${STAGE_LABELS[payment.stage]} · ${payment.method} · click para editar`}
        className="text-[11.5px] font-bold hover:opacity-70 transition-opacity"
        style={{ color }}
      >
        {payment.amount.toFixed(0)}€
      </button>
      <span
        className="text-[9px] font-medium px-0.5 rounded"
        style={{ color, opacity: 0.7 }}
      >
        {STAGE_LABELS[payment.stage].charAt(0)}
      </span>
      <button
        onClick={onDelete}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground/50 hover:text-destructive transition-all leading-none px-0.5"
      >
        ×
      </button>
    </span>
  )
}

function PaymentCell({ participantId, payments }: { participantId: string; payments: Payment[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO')
  const [stage, setStage] = useState<PaymentStage>(() =>
    payments.some((p) => p.stage === 'RESERVA') ? 'LIQUIDACION' : 'RESERVA'
  )
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return
    startTransition(async () => {
      const result = await createPayment(participantId, { amount: n, method, stage })
      if (result.error) toast.error(result.error)
      else {
        setAdding(false)
        setAmount('')
        router.refresh()
      }
    })
  }

  function handleDelete(paymentId: string) {
    startTransition(async () => {
      const result = await deletePayment(paymentId)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {payments.map((p) => (
        <PaymentPill key={p.id} payment={p} onDelete={() => handleDelete(p.id)} />
      ))}

      {adding ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="€"
            className="w-12 text-xs bg-background border border-input rounded px-1.5 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PaymentStage)}
            className="text-xs bg-background border border-input rounded px-1 py-0.5 text-foreground outline-none"
          >
            {(Object.entries(STAGE_LABELS) as [PaymentStage, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="text-xs bg-background border border-input rounded px-1 py-0.5 text-foreground outline-none"
          >
            {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={isPending}
            className="text-xs text-emerald-600 hover:text-emerald-700 px-1 font-bold"
          >
            ✓
          </button>
          <button
            onClick={() => setAdding(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-0.5"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setStage(payments.some((p) => p.stage === 'RESERVA') ? 'LIQUIDACION' : 'RESERVA')
            setAdding(true)
          }}
          className="px-1.5 py-0.5 rounded border border-border bg-transparent text-muted-foreground text-[11px] hover:border-foreground/30 hover:text-foreground transition-colors"
        >
          + Pago
        </button>
      )}
    </div>
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
      className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-card hover:bg-secondary/20 transition-colors last:border-b-0"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none text-muted-foreground/40 hover:text-muted-foreground flex items-center"
      >
        <GripVertical size={13} />
      </button>

      {/* Name */}
      <InlineField
        value={p.fullName}
        placeholder="Nombre"
        onSave={(v) => save({ fullName: v })}
        className="font-medium min-w-[110px] text-[12.5px]"
      />

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isPending}
          className="flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded transition-colors"
          style={{ background: statusCfg.bg, color: statusCfg.color, letterSpacing: '-0.1px' }}
        >
          {statusCfg.label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {(Object.entries(STATUS_CONFIG) as [OperationalStatus, typeof statusCfg][]).map(
            ([status, cfg]) => (
              <DropdownMenuItem
                key={status}
                onClick={() => save({ operationalStatus: status })}
                className="text-xs cursor-pointer"
              >
                <span className="inline-block w-2 h-2 rounded-sm mr-2 flex-shrink-0" style={{ background: cfg.color, opacity: 0.7 }} />
                {cfg.label}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Package */}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isPending}
          className="flex-shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded transition-colors"
          style={{ background: pkgCfg.bg, color: pkgCfg.color }}
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
        <SelectTrigger className="h-5 text-[11px] px-1.5 py-0 min-w-[72px] max-w-[96px] flex-shrink-0">
          <SelectValue placeholder="Instructor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="" className="text-muted-foreground text-xs">—</SelectItem>
          {instructors.filter((i) => i.active).map((i) => (
            <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* W / C / G toggles */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {TOGGLE_CONFIG.map(({ key, label, bg, color }) => {
          const checked = p[key] as boolean
          return (
            <button
              key={key}
              onClick={() => save({ [key]: !checked })}
              disabled={isPending}
              title={label === 'W' ? 'Waiver' : label === 'C' ? 'Check-in' : 'Geared'}
              style={checked
                ? { background: bg, border: `1px solid ${color}55`, color }
                : { background: 'transparent', border: '1px solid var(--border)', color: 'oklch(0.680 0.008 55)' }
              }
              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold transition-colors flex-shrink-0 cursor-pointer"
            >
              {checked ? '✓' : label}
            </button>
          )
        })}
      </div>

      {/* Weight */}
      <div className="flex items-center gap-0 flex-shrink-0">
        <InlineField
          value={p.weight ? String(p.weight) : ''}
          placeholder="—"
          onSave={(v) => {
            const n = parseFloat(v)
            save({ weight: isNaN(n) ? null : n })
          }}
          inputType="number"
          className="w-9 text-right text-muted-foreground text-[12px]"
        />
        {p.weight && <span className="text-[11px] text-muted-foreground">kg</span>}
      </div>

      <div className="flex-1" />

      {/* Payment */}
      <PaymentCell participantId={p.id} payments={p.payments} />

      {/* Delete */}
      <div className="flex-shrink-0 flex items-center ml-1">
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={handleDelete} disabled={isPending} className="text-[10px] text-destructive hover:text-destructive/80 px-1">Sí</button>
            <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-muted-foreground hover:text-foreground">No</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-[15px] leading-none px-1 text-muted-foreground/30 hover:text-destructive transition-colors"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
