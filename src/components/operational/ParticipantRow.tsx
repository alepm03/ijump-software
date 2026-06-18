'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
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
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { User } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { createWaiverToken, getParticipantWaivers } from '@/lib/actions/waiver'
import type {
  ParticipantWithDetails,
  Instructor,
  OperationalStatus,
  PackageType,
  PaymentMethod,
  PaymentStage,
  Payment,
  Waiver,
  WaiverDocumentType,
} from '@/types/domain'

// ─── Status / Package config — tokens only, no hex ───────────────────────────

const STATUS_CONFIG: Record<OperationalStatus, { label: string; className: string; dotClassName: string }> = {
  PENDING:          { label: 'Pendiente',   className: 'bg-status-pending-bg text-status-pending',           dotClassName: 'bg-status-pending' },
  CHECKED_IN:       { label: 'Check-in',    className: 'bg-status-checked-in-bg text-status-checked-in',     dotClassName: 'bg-status-checked-in' },
  WAIVER_SIGNED:    { label: 'Waiver',      className: 'bg-status-waiver-signed-bg text-status-waiver-signed', dotClassName: 'bg-status-waiver-signed' },
  BRIEFED:          { label: 'Briefed',     className: 'bg-status-briefed-bg text-status-briefed',           dotClassName: 'bg-status-briefed' },
  GEARED_UP:        { label: 'Equipado',    className: 'bg-status-geared-up-bg text-status-geared-up',       dotClassName: 'bg-status-geared-up' },
  READY:            { label: 'Listo',       className: 'bg-status-ready-bg text-status-ready',               dotClassName: 'bg-status-ready' },
  COMPLETED:        { label: 'Completado',  className: 'bg-status-completed-bg text-status-completed',       dotClassName: 'bg-status-completed' },
  CANCELLED:        { label: 'Cancelado',   className: 'bg-status-cancelled-bg text-status-cancelled',       dotClassName: 'bg-status-cancelled' },
  NO_SHOW:          { label: 'No show',     className: 'bg-status-no-show-bg text-status-no-show',           dotClassName: 'bg-status-no-show' },
  WEATHER_CANCELLED:{ label: 'Wx cancel.',  className: 'bg-status-weather-cancelled-bg text-status-weather-cancelled', dotClassName: 'bg-status-weather-cancelled' },
}

// v4: package chip → neutral outline, sin color
const PACKAGE_CONFIG: Record<PackageType, { label: string }> = {
  SOLO:           { label: 'Solo' },
  HANDYCAM:       { label: 'HC' },
  VIDEO_EXTERNO:  { label: 'VE' },
  FOTOS:          { label: 'Fotos' },
  HANDYCAM_FOTOS: { label: 'HC+F' },
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

// Maps PaymentStage to token class pairs
const STAGE_CONFIG: Record<PaymentStage, { className: string }> = {
  RESERVA:    { className: 'bg-pay-reserva-bg text-pay-reserva' },
  LIQUIDACION:{ className: 'bg-pay-liquidacion-bg text-pay-liquidacion' },
  SUPLEMENTO: { className: 'bg-pay-suplemento-bg text-pay-suplemento' },
}

// ─── StatusBadge — reusable pill ─────────────────────────────────────────────

function StatusBadge({ className, label }: { className: string; label: string }) {
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}

// ─── PackageBadge — neutral outline chip (v4) ─────────────────────────────────

function PackageBadge({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md border border-border-strong bg-card text-muted-foreground whitespace-nowrap">
      {label}
    </span>
  )
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
        className={`bg-background border border-input rounded px-1 py-0 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 min-w-0 ${className}`}
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
    return {
      label: 'Pagado',
      total,
      isOW: hasSuplemento,
      className: 'bg-pay-paid-bg text-pay-paid',
    }
  }

  const reservaTotal = payments
    .filter((p) => p.stage === 'RESERVA')
    .reduce((sum, p) => sum + p.amount, 0)
  return {
    label: 'Reservado',
    total: reservaTotal,
    isOW: hasSuplemento,
    className: 'bg-pay-reserved-bg text-pay-reserved',
  }
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
            const cfg = STAGE_CONFIG[pmt.stage]
            return (
              <div key={pmt.id} className="flex items-center gap-2.5">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 min-w-[76px] text-center ${cfg.className}`}
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
                    className="w-20 text-sm bg-background border border-input rounded px-2 py-0.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 font-bold"
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Añadir pago
        </p>
        <div className="flex gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PaymentStage)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 flex-1"
          >
            {(Object.entries(STAGE_LABELS) as [PaymentStage, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 flex-1"
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
            className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
          <Button
            onClick={handleAdd}
            disabled={isPending || !amount}
            variant="default"
            size="sm"
            className="flex-shrink-0"
          >
            Añadir
          </Button>
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
          className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full transition-opacity hover:opacity-70 cursor-pointer min-h-[32px] flex items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${status.className}`}
        >
          {status.label} · {status.total.toFixed(0)}€
        </DialogTrigger>
      ) : (
        <DialogTrigger className="flex-shrink-0 px-1.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground text-xs hover:border-foreground/30 hover:text-foreground transition-colors cursor-pointer min-h-[32px] flex items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
          + Pago
        </DialogTrigger>
      )}
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="text-body">Pagos — {participantName}</DialogTitle>
        </DialogHeader>
        <PaymentManager participantId={participantId} payments={payments} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Waiver / documents section ──────────────────────────────────────────────

const DOC_CONFIG: Record<WaiverDocumentType, { label: string }> = {
  WAIVER: { label: 'Exención de responsabilidad' },
  RGPD:   { label: 'Consentimiento informado' },
}

function WaiverSection({ participantId }: { participantId: string }) {
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [loading, setLoading] = useState(true)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [qrDocType, setQrDocType] = useState<WaiverDocumentType | null>(null)
  const [generating, setGenerating] = useState<WaiverDocumentType | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    getParticipantWaivers(participantId).then(({ waivers: w }) => {
      setWaivers(w ?? [])
      setLoading(false)
    })
  }, [participantId])

  async function handleQR(docType: WaiverDocumentType) {
    setGenerating(docType)
    const result = await createWaiverToken(participantId, docType)
    setGenerating(null)
    if (result.error) {
      toast.error(result.error)
    } else if (result.token) {
      setQrToken(result.token)
      setQrDocType(docType)
      setQrOpen(true)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        {[0, 1].map((i) => (
          <div key={i} className="h-7 rounded bg-secondary animate-pulse" />
        ))}
      </div>
    )
  }

  const qrUrl = qrToken ? `${origin}/waiver/${qrToken}` : ''

  return (
    <>
      <div>
        {(['WAIVER', 'RGPD'] as WaiverDocumentType[]).map((docType) => {
          const doc = waivers.find((w) => w.documentType === docType)
          const completed = doc?.status === 'COMPLETED'
          const pending = doc?.status === 'PENDING'

          // Badge className: completed=success, pending=accent2, default=neutral
          const badgeClass = completed
            ? 'bg-status-completed-bg text-status-completed'
            : pending
              ? 'bg-status-waiver-signed-bg text-status-waiver-signed'
              : 'bg-status-pending-bg text-status-pending'

          return (
            <div
              key={docType}
              className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0"
            >
              <span className={`text-micro font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeClass}`}>
                {docType}
              </span>

              <span className="text-sm text-foreground flex-1 truncate">
                {DOC_CONFIG[docType].label}
              </span>

              {completed ? (
                doc?.pdfUrl ? (
                  <a
                    href={doc.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:text-primary/80 font-medium flex-shrink-0 transition-colors"
                  >
                    PDF ↗
                  </a>
                ) : (
                  <span className="text-xs font-semibold flex-shrink-0 text-status-completed">
                    Firmado ✓
                  </span>
                )
              ) : (
                <button
                  onClick={() => handleQR(docType)}
                  disabled={generating === docType}
                  className="flex-shrink-0 text-xs px-2.5 py-1 rounded border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  {generating === docType ? '…' : pending ? 'Ver QR' : 'Generar QR'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={qrOpen} onOpenChange={(open) => setQrOpen(open)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {qrDocType ? DOC_CONFIG[qrDocType].label : 'Firma'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrUrl && (
              <>
                <div className="p-3 rounded-xl border border-border bg-white">
                  <QRCodeSVG value={qrUrl} size={200} />
                </div>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  Muestra este código al participante para que firme el documento en su móvil.
                </p>
                <p className="text-micro text-muted-foreground/40 font-mono break-all text-center">
                  {qrUrl}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
      <span className="text-sm text-muted-foreground flex-shrink-0 w-24">{label}</span>
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
          className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 text-right"
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
    <p className="text-xs font-semibold text-muted-foreground pt-5 pb-1 first:pt-0">
      {children}
    </p>
  )
}

// Checklist item config — colors via token class names
const CHECKLIST_ITEMS = [
  { key: 'checkInCompleted', label: 'Check-in',      activeClass: 'bg-status-checked-in border-status-checked-in' },
  { key: 'waiverSigned',     label: 'Waiver firmado', activeClass: 'bg-status-waiver-signed border-status-waiver-signed' },
  { key: 'gearedUp',         label: 'Equipado',       activeClass: 'bg-status-geared-up border-status-geared-up' },
] as const

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
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        title="Ficha del cliente"
      >
        <User size={11} />
      </SheetTrigger>

      <SheetContent side="top" className="h-[52vh] p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <SheetTitle className="text-title font-semibold leading-tight">
              {p.fullName || 'Sin nombre'}
            </SheetTitle>
            <StatusBadge className={statusCfg.className} label={statusCfg.label} />
            {p.reservationGroup && (
              <p className="text-sm text-muted-foreground ml-2">
                {SOURCE_LABELS[p.reservationGroup.source] ?? p.reservationGroup.source}
                {p.reservationGroup.payerName && (
                  <span className="text-muted-foreground/60"> · {p.reservationGroup.payerName}</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Body — Tabs (responsive: stacks on md, was 3 columns) */}
        <Tabs defaultValue="contacto" className="flex-1 overflow-hidden flex flex-col">
          <TabsList variant="line" className="px-6 flex-shrink-0 w-full rounded-none border-b border-border justify-start">
            <TabsTrigger value="contacto">Contacto</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="documentos">Notas y docs</TabsTrigger>
          </TabsList>

          {/* Tab 1: Contacto + Datos físicos */}
          <TabsContent value="contacto" className="px-5 py-4 overflow-y-auto">
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
          </TabsContent>

          {/* Tab 2: Checklist */}
          <TabsContent value="checklist" className="px-5 py-4 overflow-y-auto">
            <SectionLabel>Checklist</SectionLabel>
            <div className="space-y-1">
              {CHECKLIST_ITEMS.map(({ key, label, activeClass }) => {
                const checked = p[key]
                return (
                  <button
                    key={key}
                    onClick={() => save({ [key]: !checked })}
                    className="flex items-center gap-3 w-full px-1 py-2 rounded hover:bg-secondary transition-colors text-left group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <span
                      className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors ${
                        checked ? activeClass : 'bg-transparent border-border'
                      }`}
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
          </TabsContent>

          {/* Tab 3: Notas + Documentos */}
          <TabsContent value="documentos" className="px-5 py-4 overflow-y-auto">
            <SectionLabel>Notas</SectionLabel>
            <NotesField value={p.notes ?? ''} onSave={(v) => save({ notes: v || null })} />
            <SectionLabel>Documentos</SectionLabel>
            <WaiverSection participantId={p.id} />
          </TabsContent>
        </Tabs>
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
      className="w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground outline-none resize-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors placeholder:text-muted-foreground/40"
    />
  )
}

// ─── ParticipantRow ───────────────────────────────────────────────────────────
// v4: lg+ → grid layout aligned with ManifestColHead via --manifest-grid-cols
// md/mobile → flex-wrap layout (preserved from Phase 5)

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
      className="border-b border-border bg-card hover:bg-secondary/20 transition-colors last:border-b-0"
    >
      {/* ── lg+: single-row grid aligned with ManifestColHead ── */}
      <div className="hidden lg:flex items-center px-3.5 py-2">
        {/* Drag handle — fixed width before grid, matches col-head padding offset */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none text-muted-foreground/40 hover:text-muted-foreground flex items-center justify-center w-8 h-8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
        >
          <GripVertical size={13} />
        </button>

        {/* Grid cells — must use same --manifest-grid-cols as ManifestColHead */}
        <div
          className="flex-1 min-w-0"
          style={{
            display: 'grid',
            gridTemplateColumns: 'var(--manifest-grid-cols)',
            alignItems: 'center',
          }}
        >
          {/* Col 1: Participante (name + info icon) */}
          <div className="flex items-center gap-1.5 min-w-0 px-3">
            <InlineField
              value={p.fullName}
              placeholder="Nombre"
              onSave={(v) => save({ fullName: v })}
              className="font-medium text-sm flex-1 min-w-0"
            />
            <ParticipantInfoSheet participant={p} save={save} />
          </div>

          {/* Col 2: Estado */}
          <div className="px-3 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isPending}
                className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full transition-colors min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${statusCfg.className}`}
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
                      <span className={`inline-block w-2 h-2 rounded-sm mr-2 flex-shrink-0 opacity-70 ${cfg.dotClassName}`} />
                      {cfg.label}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Col 3: Paquete — neutral outline chip (v4) */}
          <div className="px-3 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isPending}
                className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md min-h-[32px] flex items-center"
              >
                <PackageBadge label={pkgCfg.label} />
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
          </div>

          {/* Col 4: Instructor */}
          <div className="px-3 flex items-center">
            <Select
              value={p.assignedInstructorId ?? ''}
              onValueChange={(v) => save({ assignedInstructorId: v || null })}
              disabled={isPending}
            >
              <SelectTrigger className="h-8 text-xs px-1.5 py-0 min-w-[72px] max-w-[88px]">
                <SelectValue>
                  <span className={p.assignedInstructorId ? '' : 'text-muted-foreground'}>
                    {p.assignedInstructorId
                      ? (instructors.find((i) => i.id === p.assignedInstructorId)?.name ?? '—')
                      : 'Instructor'}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="" className="text-muted-foreground text-xs">—</SelectItem>
                {instructors.filter((i) => i.active).map((i) => (
                  <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Col 5: Peso */}
          <div className="px-3 flex items-center gap-1">
            <InlineField
              value={p.weight ? String(p.weight) : ''}
              placeholder="—"
              onSave={(v) => {
                const n = parseFloat(v)
                save({ weight: isNaN(n) ? null : n })
              }}
              inputType="number"
              className="w-9 text-right text-muted-foreground text-sm"
            />
            {p.weight && <span className="text-xs text-muted-foreground">kg</span>}
            {hasOW && (
              <span className="text-micro font-bold px-1 py-0.5 rounded-full bg-status-geared-up-bg text-status-geared-up">
                OW
              </span>
            )}
          </div>

          {/* Col 6: Pago */}
          <div className="px-3 flex items-center justify-between">
            <PaymentCell
              participantId={p.id}
              participantName={p.fullName}
              payments={p.payments}
            />
            {/* Delete button — at the end of the last column */}
            <div className="flex-shrink-0 flex items-center ml-1">
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    disabled={isPending}
                    className="text-2xs text-destructive hover:text-destructive/80 px-1 py-1 min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-2xs text-muted-foreground hover:text-foreground py-1 min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-title leading-none w-8 h-8 flex items-center justify-center text-muted-foreground/30 hover:text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── md/mobile: flex-wrap layout (Phase 5 preserved) ── */}
      <div className="flex lg:hidden items-center flex-wrap gap-2 px-3.5 py-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none text-muted-foreground/40 hover:text-muted-foreground flex items-center justify-center w-8 h-8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded order-1"
        >
          <GripVertical size={13} />
        </button>

        {/* Name */}
        <InlineField
          value={p.fullName}
          placeholder="Nombre"
          onSave={(v) => save({ fullName: v })}
          className="font-medium min-w-[110px] text-sm order-2"
        />

        {/* Info sheet icon */}
        <span className="order-3">
          <ParticipantInfoSheet participant={p} save={save} />
        </span>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full transition-colors min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 order-4 ${statusCfg.className}`}
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
                  <span className={`inline-block w-2 h-2 rounded-sm mr-2 flex-shrink-0 opacity-70 ${cfg.dotClassName}`} />
                  {cfg.label}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Package — outline chip (v4) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md min-h-[32px] flex items-center order-5"
          >
            <PackageBadge label={pkgCfg.label} />
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

        {/* Payment */}
        <div className="order-6 lg:order-9 ml-auto">
          <PaymentCell
            participantId={p.id}
            participantName={p.fullName}
            payments={p.payments}
          />
        </div>

        {/* Delete */}
        <div className="flex-shrink-0 flex items-center order-10">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-2xs text-destructive hover:text-destructive/80 px-1 py-1 min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
              >
                Sí
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-2xs text-muted-foreground hover:text-foreground py-1 min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-title leading-none w-8 h-8 flex items-center justify-center text-muted-foreground/30 hover:text-destructive transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
            >
              ×
            </button>
          )}
        </div>

        {/* Invisible full-width break for row 2 */}
        <div className="w-full order-7" />

        {/* Instructor */}
        <Select
          value={p.assignedInstructorId ?? ''}
          onValueChange={(v) => save({ assignedInstructorId: v || null })}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 text-xs px-1.5 py-0 min-w-[72px] max-w-[96px] flex-shrink-0 order-8">
            <SelectValue>
              <span className={p.assignedInstructorId ? '' : 'text-muted-foreground'}>
                {p.assignedInstructorId
                  ? (instructors.find((i) => i.id === p.assignedInstructorId)?.name ?? '—')
                  : 'Instructor'}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="" className="text-muted-foreground text-xs">—</SelectItem>
            {instructors.filter((i) => i.active).map((i) => (
              <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Weight + OW */}
        <div className="flex items-center gap-1 flex-shrink-0 order-9">
          <InlineField
            value={p.weight ? String(p.weight) : ''}
            placeholder="—"
            onSave={(v) => {
              const n = parseFloat(v)
              save({ weight: isNaN(n) ? null : n })
            }}
            inputType="number"
            className="w-9 text-right text-muted-foreground text-sm"
          />
          {p.weight && <span className="text-xs text-muted-foreground">kg</span>}
          {hasOW && (
            <span className="text-micro font-bold px-1 py-0.5 rounded-full bg-status-geared-up-bg text-status-geared-up">
              OW
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
