'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, X, Check, Euro } from 'lucide-react'
import { toast } from 'sonner'
import { updateParticipant, deleteParticipant } from '@/lib/actions/participant'
import { createPayment, deletePayment } from '@/lib/actions/payment'
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

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OperationalStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-zinc-700 text-zinc-300' },
  CHECKED_IN: { label: 'Check-in', className: 'bg-blue-900 text-blue-300' },
  WAIVER_SIGNED: { label: 'Waiver', className: 'bg-purple-900 text-purple-300' },
  BRIEFED: { label: 'Briefed', className: 'bg-yellow-900 text-yellow-300' },
  GEARED_UP: { label: 'Equipado', className: 'bg-orange-900 text-orange-300' },
  READY: { label: 'Listo', className: 'bg-green-900 text-green-300' },
  COMPLETED: { label: 'Completado', className: 'bg-emerald-900 text-emerald-300' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-950 text-red-400' },
  NO_SHOW: { label: 'No show', className: 'bg-red-950 text-red-400' },
  WEATHER_CANCELLED: { label: 'Wx cancel.', className: 'bg-red-950 text-red-400' },
}

const PACKAGE_CONFIG: Record<PackageType, { label: string; className: string }> = {
  SOLO: { label: 'Solo', className: 'bg-zinc-800 text-zinc-400' },
  HANDYCAM: { label: 'HC', className: 'bg-sky-900 text-sky-300' },
  VIDEO_EXTERNO: { label: 'VE', className: 'bg-indigo-900 text-indigo-300' },
  FOTOS: { label: 'Fotos', className: 'bg-teal-900 text-teal-300' },
  HANDYCAM_FOTOS: { label: 'HC+F', className: 'bg-sky-900 text-sky-300' },
}

const STAGE_CONFIG: Record<PaymentStage, { label: string; className: string }> = {
  RESERVA: { label: 'Reserva', className: 'bg-violet-950 text-violet-300' },
  LIQUIDACION: { label: 'Liquid.', className: 'bg-emerald-950 text-emerald-300' },
  SUPLEMENTO: { label: 'Supl.', className: 'bg-yellow-950 text-yellow-300' },
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efect.',
  TARJETA: 'Tarjeta',
  BIZUM: 'Bizum',
  TRANSFERENCIA: 'Transf.',
  GROUPON: 'Groupon',
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
        className={`bg-zinc-700 border border-zinc-600 rounded px-1 py-0 text-xs text-white outline-none focus:ring-1 focus:ring-sky-500 min-w-0 ${className}`}
        autoFocus
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-text hover:bg-zinc-700/60 rounded px-1 py-0.5 text-xs transition-colors ${
        value ? 'text-zinc-200' : 'text-zinc-600'
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
          : 'bg-transparent border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400'
      }`}
    >
      {checked ? <Check size={9} /> : label[0]}
    </button>
  )
}

// ─── Payment section ──────────────────────────────────────────────────────────

function PaymentSection({
  participantId,
  payments,
  overweightFee,
  onSaveOw,
}: {
  participantId: string
  payments: Payment[]
  overweightFee: number
  onSaveOw: (fee: number) => void
}) {
  const router = useRouter()
  const [isPmtPending, startPmtTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [stage, setStage] = useState<PaymentStage>('LIQUIDACION')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO')

  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const grandTotal = paymentsTotal + overweightFee
  const hasActivity = payments.length > 0 || overweightFee > 0

  function addPayment() {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return
    startPmtTransition(async () => {
      const result = await createPayment(participantId, { amount: n, method, stage })
      if (result.error) toast.error(result.error)
      else {
        setAmount('')
        router.refresh()
      }
    })
  }

  function removePayment(id: string) {
    startPmtTransition(async () => {
      const result = await deletePayment(id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="border-t border-zinc-700/40 mt-1">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] hover:bg-zinc-700/30 transition-colors rounded-b-lg"
      >
        <Euro size={10} className="text-zinc-500 flex-shrink-0" />
        {hasActivity ? (
          <span className="text-emerald-400 font-semibold">{grandTotal.toFixed(0)}€</span>
        ) : (
          <span className="text-zinc-600">Sin pagos</span>
        )}
        {overweightFee > 0 && (
          <span className="text-yellow-400 text-[9px]">({overweightFee}€ OW)</span>
        )}
        {payments.length > 0 && (
          <span className="text-zinc-600 text-[9px]">{payments.length} pago{payments.length > 1 ? 's' : ''}</span>
        )}
        <span className="ml-auto text-zinc-600">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* Existing payments */}
          {payments.map((pmt) => (
            <div key={pmt.id} className="flex items-center gap-1 text-[10px]">
              <span className={`px-1 py-0.5 rounded font-medium flex-shrink-0 ${STAGE_CONFIG[pmt.stage].className}`}>
                {STAGE_CONFIG[pmt.stage].label}
              </span>
              <span className="text-zinc-100 font-semibold">{pmt.amount}€</span>
              <span className="text-zinc-400">{METHOD_LABELS[pmt.method]}</span>
              {pmt.notes && <span className="text-zinc-600 truncate">{pmt.notes}</span>}
              <button
                onClick={() => removePayment(pmt.id)}
                disabled={isPmtPending}
                className="ml-auto text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Overweight fee */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-500 flex-shrink-0">Sobrepeso:</span>
            <InlineField
              value={overweightFee > 0 ? String(overweightFee) : ''}
              placeholder="0"
              onSave={(v) => {
                const n = parseFloat(v)
                onSaveOw(isNaN(n) || n < 0 ? 0 : n)
              }}
              inputType="number"
              className="w-12 text-yellow-400 text-center"
            />
            <span className="text-zinc-600">€</span>
          </div>

          {/* Add payment form */}
          <div className="flex items-center gap-1 pt-0.5 border-t border-zinc-700/40">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as PaymentStage)}
              className="bg-zinc-700 rounded text-[10px] text-zinc-200 px-1 py-0.5 outline-none border-none cursor-pointer"
            >
              <option value="RESERVA">Reserva</option>
              <option value="LIQUIDACION">Liquid.</option>
              <option value="SUPLEMENTO">Supl.</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="€"
              min={0}
              className="bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-[10px] text-white w-14 outline-none focus:ring-1 focus:ring-sky-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addPayment()
              }}
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="bg-zinc-700 rounded text-[10px] text-zinc-200 px-1 py-0.5 outline-none border-none cursor-pointer"
            >
              <option value="EFECTIVO">Efect.</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="BIZUM">Bizum</option>
              <option value="TRANSFERENCIA">Transf.</option>
              <option value="GROUPON">Groupon</option>
            </select>
            <button
              onClick={addPayment}
              disabled={isPmtPending || !amount}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-zinc-600 transition-colors flex-shrink-0"
            >
              <Check size={12} />
            </button>
          </div>
        </div>
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
      className={`bg-zinc-800/60 rounded-lg border transition-colors ${
        isDragging ? 'border-sky-600' : 'border-zinc-700/50 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-start gap-1 p-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 pt-0.5 flex-shrink-0 touch-none"
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
                className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${statusCfg.className}`}
              >
                {statusCfg.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700 min-w-[140px]">
                {(Object.entries(STATUS_CONFIG) as [OperationalStatus, typeof statusCfg][]).map(
                  ([status, cfg]) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => save({ operationalStatus: status })}
                      className={`text-xs cursor-pointer ${cfg.className} hover:opacity-80`}
                    >
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
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${pkgCfg.className}`}
              >
                {pkgCfg.label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700">
                {(Object.entries(PACKAGE_CONFIG) as [PackageType, typeof pkgCfg][]).map(
                  ([pkg, cfg]) => (
                    <DropdownMenuItem
                      key={pkg}
                      onClick={() => save({ packageType: pkg })}
                      className={`text-xs cursor-pointer ${cfg.className}`}
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
              <SelectTrigger className="h-5 text-[10px] px-1.5 py-0 bg-zinc-700/50 border-zinc-600/50 text-zinc-300 min-w-[80px] max-w-[100px]">
                <SelectValue placeholder="Instructor" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="" className="text-zinc-400 text-xs focus:bg-zinc-700">
                  —
                </SelectItem>
                {instructors
                  .filter((i) => i.active)
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-white text-xs focus:bg-zinc-700">
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
                activeClass="bg-purple-800 text-purple-200"
                onClick={() => save({ waiverSigned: !p.waiverSigned })}
                disabled={isPending}
              />
              <Toggle
                checked={p.checkInCompleted}
                label="Check-in"
                activeClass="bg-blue-800 text-blue-200"
                onClick={() => save({ checkInCompleted: !p.checkInCompleted })}
                disabled={isPending}
              />
              <Toggle
                checked={p.gearedUp}
                label="Geared"
                activeClass="bg-orange-800 text-orange-200"
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
                className="text-[10px] text-red-400 hover:text-red-300 px-1"
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
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Payments section */}
      <PaymentSection
        participantId={p.id}
        payments={p.payments}
        overweightFee={p.overweightFee}
        onSaveOw={(fee) => save({ overweightFee: fee })}
      />
    </div>
  )
}

