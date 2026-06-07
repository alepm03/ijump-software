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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { User } from 'lucide-react'
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

const STAGE_LABELS: Record<PaymentStage, string> = {
  RESERVA: 'Reserva',
  LIQUIDACION: 'Liquidación',
  SUPLEMENTO: 'Suplemento',
}

const STAGE_COLORS: Record<PaymentStage, { bg: string; color: string }> = {
  RESERVA:    { bg: '#EEF2FF', color: '#6366F1' },
  LIQUIDACION:{ bg: '#ECFDF5', color: '#059669' },
  SUPLEMENTO: { bg: '#FFF7ED', color: '#EA580C' },
}

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

// ─── Payment helpers ──────────────────────────────────────────────────────────

function getPaymentStatus(payments: Payment[]) {
  if (payments.length === 0) return null
  const hasLiquidacion = payments.some((p) => p.stage === 'LIQUIDACION')
  const hasSuplemento = payments.some((p) => p.stage === 'SUPLEMENTO')
  const total = payments.reduce((sum, p) => sum + p.amount, 0)

  if (hasLiquidacion) {
    return { label: 'Pagado', total, isOW: hasSuplemento, color: '#059669', bg: '#ECFDF5' }
  }

  const reservaTotal = payments
    .filter((p) => p.stage === 'RESERVA')
    .reduce((sum, p) => sum + p.amount, 0)
  return { label: 'Reservado', total: reservaTotal, isOW: hasSuplemento, color: '#6366F1', bg: '#EEF2FF' }
}

// ─── Payment manager (inside Dialog) ─────────────────────────────────────────

function PaymentManager({
  participantId,
  payments,
}: {
  participantId: string
  payments: Payment[]
}) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO')
  const [stage, setStage] = useState<PaymentStage>(() =>
    payments.some((p) => p.stage === 'RESERVA') ? 'LIQUIDACION' : 'RESERVA'
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return
    startTransition(async () => {
      const result = await createPayment(participantId, { amount: n, method, stage })
      if (result.error) toast.error(result.error)
      else {
        setAmount('')
        router.refresh()
      }
    })
  }

  function handleUpdate(paymentId: string) {
    const n = parseFloat(editAmount)
    if (!isNaN(n) && n > 0) {
      startTransition(async () => {
        const result = await updatePayment(paymentId, { amount: n })
        if (result.error) toast.error(result.error)
        else { setEditingId(null); router.refresh() }
      })
    } else {
      setEditingId(null)
    }
  }

  function handleDelete(paymentId: string) {
    startTransition(async () => {
      const result = await deletePayment(paymentId)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Existing payments */}
      {payments.length > 0 && (
        <div className="space-y-1.5">
          {payments.map((pmt) => {
            const cfg = STAGE_COLORS[pmt.stage]
            return (
              <div key={pmt.id} className="flex items-center gap-2.5">
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded flex-shrink-0 min-w-[76px] text-center"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  {STAGE_LABELS[pmt.stage]}
                </span>

                {editingId === pmt.id ? (
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    onBlur={() => handleUpdate(pmt.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(pmt.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-20 text-sm bg-background border border-input rounded px-2 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-ring font-bold"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => { setEditingId(pmt.id); setEditAmount(String(pmt.amount)) }}
                    className="text-sm font-bold text-foreground hover:text-primary transition-colors"
                    title="Click para editar"
                  >
                    {pmt.amount.toFixed(0)}€
                  </button>
                )}

                <span className="text-xs text-muted-foreground">
                  {METHOD_LABELS[pmt.method]}
                </span>

                <button
                  onClick={() => handleDelete(pmt.id)}
                  disabled={isPending}
                  className="ml-auto text-muted-foreground/40 hover:text-destructive text-base leading-none transition-colors px-1"
                >
                  ×
                </button>
              </div>
            )
          })}

          <div className="flex justify-end pt-0.5">
            <span className="text-xs text-muted-foreground">
              Total:{' '}
              <strong className="text-foreground font-bold">
                {payments.reduce((s, p) => s + p.amount, 0).toFixed(0)}€
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Add payment form */}
      <div className="space-y-2.5 pt-1 border-t border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Añadir pago
        </p>
        <div className="flex gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PaymentStage)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-ring flex-1"
          >
            {(Object.entries(STAGE_LABELS) as [PaymentStage, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-ring flex-1"
          >
            {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Importe €"
            className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !amount}
            className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment badge (row trigger) ─────────────────────────────────────────────

function PaymentCell({
  participantId,
  participantName,
  payments,
}: {
  participantId: string
  participantName: string
  payments: Payment[]
}) {
  const status = getPaymentStatus(payments)

  return (
    <Dialog>
      {status ? (
        <DialogTrigger
          className="flex-shrink-0 text-[11.5px] font-semibold px-2 py-0.5 rounded transition-opacity hover:opacity-70 cursor-pointer"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label} · {status.total.toFixed(0)}€
        </DialogTrigger>
      ) : (
        <DialogTrigger className="flex-shrink-0 px-1.5 py-0.5 rounded border border-border bg-transparent text-muted-foreground text-[11px] hover:border-foreground/30 hover:text-foreground transition-colors cursor-pointer">
          + Pago
        </DialogTrigger>
      )}
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Pagos — {participantName}</DialogTitle>
        </DialogHeader>
        <PaymentManager participantId={participantId} payments={payments} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Participant info sheet ───────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  DIRECT: 'Directo',
  GROUPON: 'Groupon',
  BONO: 'Bono',
  PROMO: 'Promo',
  SMARTBOX: 'Smartbox',
}

function EditableRow({
  label,
  value,
  placeholder,
  onSave,
  inputType = 'text',
}: {
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
  inputType?: string
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

  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-[12px] text-muted-foreground flex-shrink-0 w-24">{label}</span>
      {editing ? (
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
          className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-ring text-right"
          autoFocus
        />
      ) : (
        <button
          onClick={startEdit}
          className={`flex-1 text-sm text-right rounded px-1 py-0.5 hover:bg-secondary transition-colors ${
            value ? 'text-foreground font-medium' : 'text-muted-foreground/40'
          }`}
        >
          {value || placeholder}
        </button>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] font-semibold text-muted-foreground pt-5 pb-1 first:pt-0">
      {children}
    </p>
  )
}

function ParticipantInfoSheet({
  participant: p,
  save,
}: {
  participant: ParticipantWithDetails
  save: (data: Parameters<typeof updateParticipant>[1]) => void
}) {
  const statusCfg = STATUS_CONFIG[p.operationalStatus]

  return (
    <Sheet>
      <SheetTrigger
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary transition-colors cursor-pointer"
        title="Ficha del cliente"
      >
        <User size={11} />
      </SheetTrigger>

      <SheetContent side="right" className="w-[340px] sm:max-w-[340px] p-0 flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-2 mb-1">
            <SheetTitle className="text-[16px] font-semibold leading-tight">
              {p.fullName || 'Sin nombre'}
            </SheetTitle>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded flex-shrink-0 mt-0.5"
              style={{ background: statusCfg.bg, color: statusCfg.color }}
            >
              {statusCfg.label}
            </span>
          </div>
          {p.reservationGroup && (
            <p className="text-[12.5px] text-muted-foreground">
              {SOURCE_LABELS[p.reservationGroup.source] ?? p.reservationGroup.source}
              {p.reservationGroup.payerName && (
                <span className="text-muted-foreground/60"> · {p.reservationGroup.payerName}</span>
              )}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <SectionLabel>Contacto</SectionLabel>
          <div>
            <EditableRow
              label="Nombre"
              value={p.fullName}
              placeholder="Sin nombre"
              onSave={(v) => save({ fullName: v })}
            />
            <EditableRow
              label="Teléfono"
              value={p.phone ?? ''}
              placeholder="—"
              onSave={(v) => save({ phone: v || null })}
              inputType="tel"
            />
            <EditableRow
              label="Email"
              value={p.email ?? ''}
              placeholder="—"
              onSave={(v) => save({ email: v || null })}
              inputType="email"
            />
          </div>

          <SectionLabel>Datos físicos</SectionLabel>
          <div>
            <EditableRow
              label="Peso"
              value={p.weight ? `${p.weight} kg` : ''}
              placeholder="—"
              onSave={(v) => {
                const n = parseFloat(v)
                save({ weight: isNaN(n) ? null : n })
              }}
              inputType="number"
            />
            <EditableRow
              label="Supl. OW"
              value={p.overweightFee ? `${p.overweightFee} €` : ''}
              placeholder="0 €"
              onSave={(v) => {
                const n = parseFloat(v)
                save({ overweightFee: isNaN(n) ? 0 : n })
              }}
              inputType="number"
            />
          </div>

          <SectionLabel>Checklist</SectionLabel>
          <div className="space-y-1">
            {(
              [
                { key: 'checkInCompleted', label: 'Check-in', color: '#3B82F6' },
                { key: 'waiverSigned',     label: 'Waiver firmado', color: '#9333EA' },
                { key: 'gearedUp',         label: 'Equipado', color: '#EA580C' },
              ] as const
            ).map(({ key, label, color }) => {
              const checked = p[key]
              return (
                <button
                  key={key}
                  onClick={() => save({ [key]: !checked })}
                  className="flex items-center gap-3 w-full px-1 py-2 rounded hover:bg-secondary transition-colors text-left group"
                >
                  <span
                    className="w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors"
                    style={checked
                      ? { background: color, borderColor: color }
                      : { background: 'transparent', borderColor: 'var(--border)' }
                    }
                  >
                    {checked && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className={`text-sm transition-colors ${checked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>

          <SectionLabel>Notas</SectionLabel>
          <NotesField value={p.notes ?? ''} onSave={(v) => save({ notes: v || null })} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      placeholder="Sin notas"
      rows={3}
      className="w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground outline-none resize-none focus:border-input focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground/40"
    />
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
  const hasOW = p.payments.some((pmt) => pmt.stage === 'SUPLEMENTO')

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

      {/* Name + info */}
      <InlineField
        value={p.fullName}
        placeholder="Nombre"
        onSave={(v) => save({ fullName: v })}
        className="font-medium min-w-[110px] text-[12.5px]"
      />
      <ParticipantInfoSheet participant={p} save={save} />

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

      {/* Weight + OW */}
      <div className="flex items-center gap-1 flex-shrink-0">
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
        {hasOW && (
          <span
            className="text-[9.5px] font-bold px-1 py-0.5 rounded"
            style={{ background: '#FFF7ED', color: '#EA580C' }}
          >
            OW
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Payment */}
      <PaymentCell
        participantId={p.id}
        participantName={p.fullName}
        payments={p.payments}
      />

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
