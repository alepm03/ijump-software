'use client'

/**
 * The group side of a booking, rendered inside LeadSheet.
 *
 * Two panels, because they belong in different columns of the sheet:
 *   - GroupMembersPanel — who is coming, and who pays (left, with the rest of
 *     the booking data).
 *   - GroupBalancePanel — what the party owes and the single group charge
 *     (right, next to the individual payments).
 *
 * Both are presentational: the balance is computed from data the sheet already
 * has (each member carries its own itemsTotal and payments), so opening a
 * booking costs no extra round trip.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Baby, Plus, Users } from 'lucide-react'
import {
  addCompanion,
  payGroup,
  removeCompanion,
  setGroupPaymentMode,
} from '@/lib/actions/group'
import { updateParticipant } from '@/lib/actions/participant'
import { splitGroupPayment } from '@/lib/finance/group-payment'
import { InlineField } from '@/components/operational/InlineField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  GroupPaymentMode,
  LeadWithDetails,
  PackageType,
  PaymentMethod,
  PaymentStage,
} from '@/types/domain'
import { PACKAGE_LABELS } from '@/types/domain'


const PAYMENT_MODE_LABELS: Record<GroupPaymentMode, string> = {
  UNDECIDED: 'Sin decidir',
  ORGANIZER: 'Paga el organizador',
  INDIVIDUAL: 'Cada uno lo suyo',
}

const PAYMENT_METHODS: PaymentMethod[] = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA', 'GROUPON']
const PAYMENT_STAGES: Record<PaymentStage, string> = {
  RESERVA: 'Señal / reserva',
  LIQUIDACION: 'Liquidación',
  SUPLEMENTO: 'Suplemento',
}

function euro(amount: number): string {
  return `${amount.toFixed(2).replace(/\.00$/, '')} €`
}

/** Organizer first, then the rest — the same order they get seated in. */
function membersOf(lead: LeadWithDetails): LeadWithDetails[] {
  return [lead, ...lead.companions]
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-2xs text-muted-foreground">{children}</span>
}

// ─── Members ─────────────────────────────────────────────────

export function GroupMembersPanel({ lead }: { lead: LeadWithDetails }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [packageType, setPackageType] = useState<PackageType>(lead.packageType)
  const [isMinor, setIsMinor] = useState(false)

  const members = membersOf(lead)

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        if (success) toast.success(success)
        router.refresh()
      }
    })
  }

  function handleAdd() {
    if (!name.trim()) {
      toast.error('El nombre del acompañante es obligatorio')
      return
    }
    if (!lead.reservationGroupId) {
      toast.error('Esta reserva no tiene grupo asociado')
      return
    }
    const parsedWeight = parseFloat(weight)
    startTransition(async () => {
      const result = await addCompanion(lead.reservationGroupId as string, {
        fullName: name.trim(),
        weight: isNaN(parsedWeight) ? null : parsedWeight,
        packageType,
        isMinor,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${name.trim()} añadido a la reserva`)
      setName('')
      setWeight('')
      setIsMinor(false)
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Quién viene
        </p>
        <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
          <Users size={11} /> {members.length} {members.length === 1 ? 'persona' : 'personas'}
        </span>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        {members.map((member, index) => (
          <div key={member.id} className="flex items-center gap-2 px-2.5 py-2">
            <span className="text-2xs text-muted-foreground w-8 flex-shrink-0">
              {index + 1}/{members.length}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <InlineField
                value={member.fullName}
                placeholder="Nombre"
                onSave={(v) => { if (v) run(() => updateParticipant(member.id, { fullName: v })) }}
                className="text-sm"
              />
              {member.isOrganizer && (
                <span
                  className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-primary whitespace-nowrap"
                  title="Hace la reserva y aporta el contacto del grupo"
                >
                  Organiza
                </span>
              )}
            </div>
            <div className="w-16 flex-shrink-0 text-xs text-muted-foreground" title="Peso: fija el límite del tándem y el recargo de sobrepeso">
              <InlineField
                value={member.weight != null ? String(member.weight) : ''}
                placeholder="– kg"
                onSave={(v) => {
                  const w = parseFloat(v)
                  run(() => updateParticipant(member.id, { weight: isNaN(w) ? null : w }))
                }}
                inputType="number"
              />
            </div>
            <button
              onClick={() => run(
                () => updateParticipant(member.id, { isMinor: !member.isMinor }),
                member.isMinor ? 'Marcado como mayor de edad' : 'Marcado como menor de edad'
              )}
              disabled={isPending}
              title={
                member.isMinor
                  ? 'Menor de edad: falta la autorización paterna firmada. Pulsa para desmarcar'
                  : 'Marcar como menor de edad'
              }
              className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
                member.isMinor
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              }`}
            >
              <Baby size={12} />
            </button>
            {!member.isOrganizer && (
              <button
                onClick={() => {
                  if (confirm(`¿Quitar a ${member.fullName} de la reserva?`)) {
                    run(() => removeCompanion(member.id), `${member.fullName} ya no forma parte de la reserva`)
                  }
                }}
                disabled={isPending}
                className="text-2xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="rounded-md border border-primary/40 bg-secondary/40 p-3 space-y-2">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div className="flex flex-col gap-1">
              <FieldLabel>Nombre y apellidos</FieldLabel>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del acompañante"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Peso (kg)</FieldLabel>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="–"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Paquete</FieldLabel>
            <Select value={packageType} onValueChange={(v) => setPackageType(v as PackageType)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue>{PACKAGE_LABELS[packageType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PACKAGE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isMinor}
              onChange={(e) => setIsMinor(e.target.checked)}
              className="accent-primary"
            />
            Es menor de edad (necesita autorización paterna)
          </label>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleAdd} disabled={isPending} className="h-7 text-xs">
              Añadir
            </Button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={!lead.reservationGroupId}
          title={
            lead.reservationGroupId
              ? undefined
              : 'Esta reserva antigua no tiene grupo asociado; edita la fuente de venta para crearle uno'
          }
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
        >
          <Plus size={13} /> Añadir acompañante
        </button>
      )}

      <div className="flex flex-col gap-1 pt-1">
        <FieldLabel>Quién paga</FieldLabel>
        <Select
          value={lead.reservationGroup?.paymentMode ?? 'UNDECIDED'}
          onValueChange={(v) => {
            if (!lead.reservationGroupId) return
            run(
              () => setGroupPaymentMode(lead.reservationGroupId as string, v as GroupPaymentMode),
              'Forma de pago anotada'
            )
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue>
              {PAYMENT_MODE_LABELS[lead.reservationGroup?.paymentMode ?? 'UNDECIDED']}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PAYMENT_MODE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-2xs text-muted-foreground/70">
          Solo deja constancia de lo acordado. No impide ningún cobro.
        </span>
      </div>
    </div>
  )
}

// ─── Balance and the single group charge ─────────────────────

export function GroupBalancePanel({ lead }: { lead: LeadWithDetails }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [charging, setCharging] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO')
  const [stage, setStage] = useState<PaymentStage>('RESERVA')

  const members = membersOf(lead)

  const balance = useMemo(() => {
    const rows = members.map((m) => ({
      participantId: m.id,
      fullName: m.fullName,
      isOrganizer: m.isOrganizer,
      itemsTotal: m.itemsTotal,
      paidTotal: m.paidTotal,
      pending: Math.max(0, m.itemsTotal - m.paidTotal),
    }))
    return {
      rows,
      itemsTotal: rows.reduce((s, r) => s + r.itemsTotal, 0),
      paidTotal: rows.reduce((s, r) => s + r.paidTotal, 0),
      pending: rows.reduce((s, r) => s + r.pending, 0),
      unsettled: rows.filter((r) => r.pending > 0).length,
    }
  }, [members])

  // Live preview of the split, so the staff sees who gets charged what
  // BEFORE registering it — the shares always add up to the amount typed.
  const preview = useMemo(() => {
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return []
    return splitGroupPayment(parsed, balance.rows)
  }, [amount, balance.rows])

  function handleCharge() {
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    if (!lead.reservationGroupId) return
    startTransition(async () => {
      const result = await payGroup(lead.reservationGroupId as string, {
        amount: parsed,
        method,
        stage,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${euro(parsed)} repartidos entre ${result.shares} personas`)
      setAmount('')
      setCharging(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">
        Saldo del grupo
      </p>

      <div className="rounded-md border border-border px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Cobrado</span>
          <span className="font-semibold text-foreground">
            {euro(balance.paidTotal)}
            {balance.itemsTotal > 0 && (
              <span className="text-muted-foreground font-normal"> de {euro(balance.itemsTotal)}</span>
            )}
          </span>
        </div>
        {balance.pending > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pendiente</span>
            <span className="font-semibold text-amber-600">{euro(balance.pending)}</span>
          </div>
        )}
        <p className="text-2xs text-muted-foreground/80 pt-0.5">
          {balance.unsettled === 0
            ? 'Todo el grupo está al corriente.'
            : `Faltan ${balance.unsettled} ${balance.unsettled === 1 ? 'persona' : 'personas'} por saldar.`}
        </p>
      </div>

      {charging ? (
        <div className="rounded-md border border-primary/40 bg-secondary/40 p-3 space-y-2">
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <div className="flex flex-col gap-1">
              <FieldLabel>Importe</FieldLabel>
              <Input
                autoFocus
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Método</FieldLabel>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue>{method}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Etapa</FieldLabel>
            <Select value={stage} onValueChange={(v) => setStage(v as PaymentStage)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue>{PAYMENT_STAGES[stage]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_STAGES).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preview.length > 0 && (
            <div className="rounded border border-border bg-background px-2.5 py-2 space-y-1">
              <p className="text-2xs text-muted-foreground">Se repartirá así:</p>
              {preview.map((share) => {
                const member = balance.rows.find((r) => r.participantId === share.participantId)
                return (
                  <div key={share.participantId} className="flex items-center justify-between text-2xs">
                    <span className="text-foreground truncate">{member?.fullName}</span>
                    <span className="text-muted-foreground">{euro(share.amount)}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleCharge} disabled={isPending} className="h-7 text-xs">
              Registrar cobro
            </Button>
            <button
              onClick={() => setCharging(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCharging(true)}
          disabled={!lead.reservationGroupId}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50"
          title="Un solo importe, repartido entre los miembros según lo que debe cada uno"
        >
          <Plus size={13} /> Cobrar a todo el grupo
        </button>
      )}
    </div>
  )
}
