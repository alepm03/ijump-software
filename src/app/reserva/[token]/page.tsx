/**
 * GET /reserva/{token} — public reservation status page.
 *
 * H4 fix (AUDITORIA.md) — the bot API (`src/app/api/bot/v1/reservations/route.ts`)
 * has always returned `statusUrl: /reserva/{token}` to the chatbot, but this
 * page didn't exist, so every link the bot handed to a customer 404'd.
 *
 * Server component, unauthenticated by design (the token itself is the
 * capability — same pattern as `/waiver/[token]`). Looks up the lead with
 * `getLeadByIdOrToken` (shared with `GET /api/bot/v1/reservations/{idOrToken}`)
 * passing the service client, since an anonymous visitor has no Supabase
 * session and every `participants` RLS policy is `TO authenticated` — the
 * cookie-based client would just see zero rows.
 *
 * Privacy: only the first name is shown (no surname, phone, or email) — see
 * AUDITORIA.md H4 scope note.
 */

import { notFound } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createServiceClient } from '@/lib/supabase/service'
import { getLeadByIdOrToken } from '@/lib/actions/leads'
import type { LeadStatus, PackageType } from '@/types/domain'

export const dynamic = 'force-dynamic'

const BUSINESS_PHONE = '+34 679 57 11 99'
const BUSINESS_PHONE_HREF = '+34679571199'

const PACKAGE_LABELS: Record<PackageType, string> = {
  SOLO: 'Solo (sin video)',
  HANDYCAM: 'Handycam',
  VIDEO_EXTERNO: 'Videógrafo externo',
  FOTOS: 'Fotos',
  HANDYCAM_FOTOS: 'Handycam + Fotos',
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return format(parseISO(iso), "EEEE d 'de' MMMM", { locale: es })
  } catch {
    return null
  }
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  // DB stores HH:MM:SS — show HH:MM.
  return time.slice(0, 5)
}

type StatusPresentation = {
  label: string
  description: string
  tone: 'pending' | 'confirmed' | 'attention' | 'cancelled'
}

function presentStatus(
  status: LeadStatus | null,
  dateLabel: string | null,
  timeLabel: string | null
): StatusPresentation {
  switch (status) {
    case 'NEW':
      return {
        label: 'Pendiente de confirmación',
        description: 'Estamos revisando tu reserva. Te contactaremos en breve para confirmar el día y la hora.',
        tone: 'pending',
      }
    case 'TENTATIVE':
      return {
        label: 'Pendiente de confirmación',
        description: dateLabel
          ? `Tienes una plaza reservada de forma provisional para el ${dateLabel}. Te confirmaremos en cuanto se cierre el vuelo.`
          : 'Tienes una plaza reservada de forma provisional. Te confirmaremos en cuanto se cierre el vuelo.',
        tone: 'pending',
      }
    case 'CONFIRMED':
      return {
        label: 'Confirmada',
        description: dateLabel
          ? `Tu salto está confirmado para el ${dateLabel}${timeLabel ? ` a las ${timeLabel}` : ''}.`
          : 'Tu salto está confirmado.',
        tone: 'confirmed',
      }
    case 'RESCHEDULE_NEEDED':
      return {
        label: 'Reprogramación pendiente',
        description: 'Tu fecha original no se pudo mantener y necesitamos reprogramar tu salto. Nos pondremos en contacto contigo.',
        tone: 'attention',
      }
    case 'CANCELLED':
      return {
        label: 'Cancelada',
        description: 'Esta reserva ha sido cancelada. Si crees que es un error, contáctanos.',
        tone: 'cancelled',
      }
    case 'NO_SHOW':
      return {
        label: 'No presentado',
        description: 'Registramos esta reserva como no presentada. Si quieres reprogramar tu salto, contáctanos.',
        tone: 'cancelled',
      }
    default:
      return {
        label: 'Estado desconocido',
        description: 'No pudimos determinar el estado de tu reserva. Contáctanos y lo revisamos contigo.',
        tone: 'attention',
      }
  }
}

const TONE_STYLES: Record<StatusPresentation['tone'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  attention: 'bg-orange-50 text-orange-700',
  cancelled: 'bg-red-50 text-red-700',
}

export default async function ReservationStatusPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = createServiceClient()
  const { lead, error } = await getLeadByIdOrToken(token, supabase)

  if (error || !lead) {
    notFound()
  }

  const confirmedDateLabel = formatDate(lead.confirmedDate)
  const confirmedTimeLabel = formatTime(lead.confirmedTime)
  const preferredDateLabel = formatDate(lead.preferredDate)
  const dateLabel = confirmedDateLabel ?? preferredDateLabel
  const status = presentStatus(lead.status, dateLabel, confirmedTimeLabel)

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            I Jump Skydive
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground">
            Hola, {firstName(lead.fullName)}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${TONE_STYLES[status.tone]}`}
          >
            {status.label}
          </span>

          <p className="mt-3 text-sm text-foreground">{status.description}</p>

          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            {confirmedDateLabel && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Fecha confirmada</dt>
                <dd className="text-right font-medium text-foreground capitalize">
                  {confirmedDateLabel}
                  {confirmedTimeLabel ? ` · ${confirmedTimeLabel}` : ''}
                </dd>
              </div>
            )}
            {!confirmedDateLabel && preferredDateLabel && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Fecha preferida</dt>
                <dd className="text-right font-medium text-foreground capitalize">{preferredDateLabel}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Paquete</dt>
              <dd className="text-right font-medium text-foreground">
                {PACKAGE_LABELS[lead.packageType] ?? lead.packageType}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>¿Alguna duda? Llámanos o escríbenos:</p>
          <a
            href={`tel:${BUSINESS_PHONE_HREF}`}
            className="mt-1 inline-block font-semibold text-primary"
          >
            {BUSINESS_PHONE}
          </a>
        </div>
      </div>
    </div>
  )
}
