'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateParticipant, deleteParticipant } from '@/lib/actions/participant'
import { InlineField } from '@/components/operational/InlineField'
import { PaymentManager } from '@/components/operational/shared/PaymentManager'
import { NotesField } from '@/components/operational/shared/NotesField'
import { addOverweightSupplement } from '@/lib/actions/finance'
import { AR_BALANCE_EPSILON } from '@/lib/finance/itemization-engine'
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
import { User } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { createWaiverToken, getParticipantWaivers } from '@/lib/actions/waiver'
import type {
  ParticipantWithDetails,
  Instructor,
  OperationalStatus,
  PackageType,
  Payment,
  ParticipantItem,
  Waiver,
  WaiverDocumentType,
} from '@/types/domain'
import { RESERVATION_SOURCE_LABELS } from '@/types/domain'

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

// ─── ChannelBadge — discreet "Web"/"Bot" tag for non-staff confirmed leads ───

const CHANNEL_BADGE_LABELS: Partial<Record<ParticipantWithDetails['channel'], string>> = {
  WEB_BOT: 'Web',
  WHATSAPP_BOT: 'Bot',
}

function ChannelBadge({ channel }: { channel: ParticipantWithDetails['channel'] }) {
  const label = CHANNEL_BADGE_LABELS[channel]
  if (!label) return null
  return (
    <span
      className="text-2xs font-medium px-1.5 py-0.5 rounded-full border border-border bg-secondary/60 text-muted-foreground whitespace-nowrap flex-shrink-0"
      title="Reserva originada fuera del manifest"
    >
      {label}
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

// ─── AR balance helper (Sprint 1 treasury) ────────────────────────────────────
// balance = Σ(items) − Σ(payments), derived — see getArSummary in finance.ts
// for the equivalent server-side aggregate used by the Cobros view.

function getBalance(items: ParticipantItem[], payments: Payment[]): number {
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0)
  return itemsTotal - paymentsTotal
}

function BalanceBadge({ balance }: { balance: number }) {
  if (balance <= AR_BALANCE_EPSILON) return null
  return (
    <span
      className="flex-shrink-0 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive whitespace-nowrap"
      title="Saldo pendiente de cobro"
    >
      Debe {balance.toFixed(0)}€
    </span>
  )
}

// ─── OW quick-add button (Sprint 1 treasury — one click, no form) ────────────

function AddOverweightButton({ participantId }: { participantId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await addOverweightSupplement(participantId)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Añadir suplemento de sobrepeso"
      className="flex-shrink-0 text-2xs font-medium px-1.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors cursor-pointer min-h-[28px] flex items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40"
    >
      + OW
    </button>
  )
}

// ─── Payment badge (row trigger) ─────────────────────────────────────────────

function PaymentCell({
  participantId,
  participantName,
  payments,
  items,
}: {
  participantId: string
  participantName: string
  payments: Payment[]
  items: ParticipantItem[]
}) {
  const status = getPaymentStatus(payments)
  const balance = getBalance(items, payments)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
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
            <DialogTitle className="text-body truncate">Pagos </DialogTitle>
          </DialogHeader>
          <PaymentManager participantId={participantId} payments={payments} />
        </DialogContent>
      </Dialog>
      <BalanceBadge balance={balance} />
    </div>
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

function EditableRow({
  label,
  value,
  placeholder,
  onSave,
  inputType = 'text',
  suffix,
}: {
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
  inputType?: string
  suffix?: string
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
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
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
          className="text-sm bg-background border border-input rounded px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 w-full"
          autoFocus
        />
      ) : (
        <button
          onClick={startEdit}
          className={`text-sm text-left px-2 py-1.5 rounded border transition-colors hover:bg-primary/5 hover:border-primary/50 ${
            value
              ? 'text-foreground font-medium border-primary/20'
              : 'text-muted-foreground/40 border-primary/15'
          }`}
        >
          {value ? (suffix ? `${value} ${suffix}` : value) : placeholder}
        </button>
      )}
    </div>
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
          </div>
        </div>

        {/* Body — 2 columnas: datos | notas + docs */}
        <div className="flex-1 overflow-hidden grid grid-cols-[5fr_6fr] divide-x divide-border">

          {/* ── Columna izquierda: datos del participante ── */}
          <div className="px-6 py-5 overflow-y-auto space-y-5">

            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">Contacto</p>
              <EditableRow
                label="Nombre completo"
                value={p.fullName}
                placeholder="Sin nombre"
                onSave={(v) => save({ fullName: v })}
              />
              <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60 pt-2">Datos físicos</p>
              <div className="grid grid-cols-2 gap-3">
                <EditableRow
                  label="Peso"
                  value={p.weight ? String(p.weight) : ''}
                  placeholder="—"
                  suffix="kg"
                  onSave={(v) => {
                    const n = parseFloat(v)
                    save({ weight: isNaN(n) ? null : n })
                  }}
                  inputType="number"
                />
                <EditableRow
                  label="Suplemento OW"
                  value={p.overweightFee ? String(p.overweightFee) : ''}
                  placeholder="0"
                  suffix="€"
                  onSave={(v) => {
                    const n = parseFloat(v)
                    save({ overweightFee: isNaN(n) ? 0 : n })
                  }}
                  inputType="number"
                />
              </div>
            </div>

            {p.reservationGroup && (
              <div className="space-y-3 pt-1 border-t border-border/40">
                <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60 pt-2">Reserva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Canal</span>
                    <span className="text-sm font-medium text-foreground px-2 py-1.5">
                      {RESERVATION_SOURCE_LABELS[p.reservationGroup.source] ?? p.reservationGroup.source}
                    </span>
                  </div>
                  {p.reservationGroup.payerName && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Pagador</span>
                      <span className="text-sm font-medium text-foreground px-2 py-1.5">
                        {p.reservationGroup.payerName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ── Columna derecha: notas + documentos ── */}
          <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">Notas internas</p>
              <NotesField value={p.notes ?? ''} onSave={(v) => save({ notes: v || null })} />
            </div>

            <div className="border-t border-border/40 pt-4 flex flex-col gap-3">
              <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">Documentos</p>
              <WaiverSection participantId={p.id} />
            </div>

          </div>

        </div>
      </SheetContent>
    </Sheet>
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
          {/* Col 1: Participante — Complete button (first), then name, then info icon */}
          <div className="flex items-center gap-1.5 min-w-0 px-3">
            {/* Complete toggle — circular button, prominent */}
            <button
              onClick={() => save({ operationalStatus: p.operationalStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })}
              disabled={isPending}
              title={p.operationalStatus === 'COMPLETED' ? 'Marcar pendiente' : 'Marcar completado'}
              className={`flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 p-[5px] ${
                p.operationalStatus === 'COMPLETED'
                  ? 'bg-status-completed text-card border border-status-completed'
                  : 'bg-transparent border border-border-strong text-transparent hover:border-status-completed'
              }`}
            >
              <Check size={10} strokeWidth={3} className={p.operationalStatus === 'COMPLETED' ? 'text-card' : 'text-transparent'} />
            </button>
            <InlineField
              value={p.fullName}
              placeholder="Nombre"
              onSave={(v) => save({ fullName: v })}
              className="font-medium text-sm flex-1 min-w-0"
            />
            {p.channel !== 'STAFF' && p.leadStatus === 'CONFIRMED' && (
              <ChannelBadge channel={p.channel} />
            )}
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

          {/* Col 5: OW */}
          <div className="px-3 flex items-center">
            {hasOW ? (
              <span className="text-micro font-bold px-1.5 py-0.5 rounded-full bg-status-geared-up-bg text-status-geared-up">
                OW
              </span>
            ) : (
              <AddOverweightButton participantId={p.id} />
            )}
          </div>

          {/* Col 6: Pago */}
          <div className="px-3 flex items-center">
            <PaymentCell
              participantId={p.id}
              participantName={p.fullName}
              payments={p.payments}
              items={p.items}
            />
          </div>
        </div>

        {/* Delete button — outside the grid, mirrored by trailing spacer in ManifestColHead */}
        <div className="flex-shrink-0 flex items-center justify-end w-12">
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

        {/* Complete toggle — first thing in the "participant" visual group */}
        <button
          onClick={() => save({ operationalStatus: p.operationalStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })}
          disabled={isPending}
          title={p.operationalStatus === 'COMPLETED' ? 'Marcar pendiente' : 'Marcar completado'}
          className={`flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 p-[5px] order-2 ${
            p.operationalStatus === 'COMPLETED'
              ? 'bg-status-completed text-card border border-status-completed'
              : 'bg-transparent border border-border-strong text-transparent hover:border-status-completed'
          }`}
        >
          <Check size={10} strokeWidth={3} className={p.operationalStatus === 'COMPLETED' ? 'text-card' : 'text-transparent'} />
        </button>

        {/* Name */}
        <InlineField
          value={p.fullName}
          placeholder="Nombre"
          onSave={(v) => save({ fullName: v })}
          className="font-medium min-w-[110px] text-sm order-3"
        />

        {p.channel !== 'STAFF' && p.leadStatus === 'CONFIRMED' && (
          <span className="order-4">
            <ChannelBadge channel={p.channel} />
          </span>
        )}

        {/* Info sheet icon */}
        <span className="order-4">
          <ParticipantInfoSheet participant={p} save={save} />
        </span>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isPending}
            className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full transition-colors min-h-[32px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 order-5 ${statusCfg.className}`}
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
            className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-md min-h-[32px] flex items-center order-6"
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
        <div className="order-7 ml-auto">
          <PaymentCell
            participantId={p.id}
            participantName={p.fullName}
            payments={p.payments}
            items={p.items}
          />
        </div>

        {/* Delete */}
        <div className="flex-shrink-0 flex items-center order-11">
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
        <div className="w-full order-8" />

        {/* Instructor */}
        <Select
          value={p.assignedInstructorId ?? ''}
          onValueChange={(v) => save({ assignedInstructorId: v || null })}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 text-xs px-1.5 py-0 min-w-[72px] max-w-[96px] flex-shrink-0 order-9">
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

        {/* OW */}
        <div className="flex items-center flex-shrink-0 order-10">
          {hasOW ? (
            <span className="text-micro font-bold px-1.5 py-0.5 rounded-full bg-status-geared-up-bg text-status-geared-up">
              OW
            </span>
          ) : (
            <AddOverweightButton participantId={p.id} />
          )}
        </div>
      </div>
    </div>
  )
}
