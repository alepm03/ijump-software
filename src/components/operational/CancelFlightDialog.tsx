'use client'

/**
 * CancelFlightDialog — Sprint 3 E2.
 *
 * Cancelling a flight with occupants requires a destination for them
 * (zero-orphans rule enforced server-side by cancelFlight — see
 * src/lib/actions/flight.ts). This dialog lets staff pick:
 *   - an existing flight of the day with enough free seats,
 *   - a brand-new flight (pre-filled with the cancelled flight's time),
 *     only offered while the day hasn't hit maxFlightsPerDay,
 *   - rescheduling: occupants return to /reservas ("Reagendar" tab) to be
 *     rebooked on another date (weather-cancellation circuit, per flight), or
 *   - definitive cancellation: occupants are cancelled with the flight and
 *     any deposit already collected is kept (non-refundable).
 * The last two are always available, so cancelling a flight is never
 * blocked by a full day.
 *
 * Free-seat math and the maxFlightsPerDay check are done client-side for
 * UX only (disable options, show messaging) — the server re-validates
 * everything via reservations_move_participants / cancelFlight and is the
 * actual source of truth.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cancelFlight } from '@/lib/actions/flight'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { AvailabilityPolicy, FlightWithParticipants } from '@/types/domain'

/** operational_status values that mean "not actually occupying a seat" — same rule as pnl-engine's NON_COMPLETED_STATUSES. */
const INACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'CANCELLED',
  'NO_SHOW',
  'WEATHER_CANCELLED',
])

function activeCount(flight: FlightWithParticipants): number {
  return flight.participants.filter((p) => !INACTIVE_STATUSES.has(p.operationalStatus)).length
}

interface CancelFlightDialogProps {
  flight: FlightWithParticipants | null
  flights: FlightWithParticipants[]
  policy: AvailabilityPolicy
  onClose: () => void
}

export function CancelFlightDialog({ flight, flights, policy, onClose }: CancelFlightDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selection, setSelection] = useState<string>('') // flightId, or 'new'
  const [newTime, setNewTime] = useState<string>('')

  const open = flight !== null

  // Reset local state whenever a different flight is opened.
  const flightId = flight?.id ?? null
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  if (flight && initializedFor !== flightId) {
    setSelection('')
    setNewTime(flight.estimatedDepartureTime ?? '')
    setInitializedFor(flightId)
  }

  if (!flight) return null

  const occupants = activeCount(flight)
  const candidateFlights = flights.filter(
    (f) => f.id !== flight.id && f.status !== 'CANCELLED'
  )

  // Server counts ALL flights of the day (cancelled included) against
  // maxFlightsPerDay — mirror that here for the disable check.
  const canCreateNew = flights.length < policy.maxFlightsPerDay

  const options = candidateFlights.map((f) => {
    const active = activeCount(f)
    const free = policy.maxClientsPerFlight - active
    return {
      flight: f,
      free,
      disabled: free < occupants,
    }
  })

  function handleConfirm() {
    if (!flight) return

    if (occupants === 0) {
      startTransition(async () => {
        const result = await cancelFlight(flight.id, null)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Vuelo cancelado')
        router.refresh()
        onClose()
      })
      return
    }

    if (selection === 'reschedule' || selection === 'cancel-all') {
      const destination =
        selection === 'reschedule' ? ({ type: 'reschedule' } as const) : ({ type: 'cancel' } as const)
      startTransition(async () => {
        const result = await cancelFlight(flight.id, destination)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success(
          selection === 'reschedule'
            ? 'Vuelo cancelado — participantes enviados a Reservas para reagendar'
            : 'Vuelo y participantes cancelados'
        )
        router.refresh()
        onClose()
      })
      return
    }

    if (selection === 'new') {
      startTransition(async () => {
        const result = await cancelFlight(flight.id, {
          type: 'new',
          estimatedDepartureTime: newTime.trim() || null,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Vuelo cancelado y participantes movidos')
        router.refresh()
        onClose()
      })
      return
    }

    if (selection) {
      startTransition(async () => {
        const result = await cancelFlight(flight.id, { type: 'existing', toFlightId: selection })
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Vuelo cancelado y participantes movidos')
        router.refresh()
        onClose()
      })
    }
  }

  const canConfirm =
    occupants === 0 ? true : selection === 'new' ? canCreateNew : selection !== ''

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar vuelo #{flight.flightNumber}</DialogTitle>
          {occupants === 0 ? (
            <DialogDescription>
              Este vuelo no tiene participantes. ¿Confirmas la cancelación?
            </DialogDescription>
          ) : (
            <DialogDescription>
              ¿Qué hacemos con {occupants === 1 ? 'su participante' : `sus ${occupants} participantes`}?
              Muévelos a otro vuelo del día, envíalos a reagendar o cancélalos:
            </DialogDescription>
          )}
        </DialogHeader>

        {occupants > 0 && (
          <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                {options.map(({ flight: f, free, disabled }) => (
                  <label
                    key={f.id}
                    className={`flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer hover:bg-secondary/50'
                    } ${selection === f.id ? 'border-primary/40 bg-secondary/40' : ''}`}
                  >
                    <input
                      type="radio"
                      name="cancel-flight-destination"
                      value={f.id}
                      checked={selection === f.id}
                      disabled={disabled}
                      onChange={() => setSelection(f.id)}
                      className="accent-primary"
                    />
                    <span className="text-foreground">
                      Vuelo #{f.flightNumber} · {f.estimatedDepartureTime ?? '--:--'} · {free}{' '}
                      {free === 1 ? 'plaza libre' : 'plazas libres'}
                    </span>
                  </label>
                ))}

                <label
                  className={`flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors ${
                    !canCreateNew
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-secondary/50'
                  } ${selection === 'new' ? 'border-primary/40 bg-secondary/40' : ''}`}
                >
                  <input
                    type="radio"
                    name="cancel-flight-destination"
                    value="new"
                    checked={selection === 'new'}
                    disabled={!canCreateNew}
                    onChange={() => setSelection('new')}
                    className="accent-primary"
                  />
                  <span className="text-foreground flex-1">Crear vuelo nuevo</span>
                  {selection === 'new' && canCreateNew && (
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="h-7 w-24 text-sm tabular-nums"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </label>
                {!canCreateNew && (
                  <p className="text-xs text-muted-foreground px-1">
                    Se alcanzó el máximo de vuelos del día.
                  </p>
                )}

                <label
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    selection === 'reschedule'
                      ? 'border-primary/40 bg-secondary/40'
                      : 'border-border hover:bg-secondary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel-flight-destination"
                    value="reschedule"
                    checked={selection === 'reschedule'}
                    onChange={() => setSelection('reschedule')}
                    className="accent-primary"
                  />
                  <span className="text-foreground">
                    Reagendar — vuelven a Reservas para elegir otra fecha
                  </span>
                </label>

                <label
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                    selection === 'cancel-all'
                      ? 'border-destructive/40 bg-destructive/5'
                      : 'border-border hover:bg-secondary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel-flight-destination"
                    value="cancel-all"
                    checked={selection === 'cancel-all'}
                    onChange={() => setSelection('cancel-all')}
                    className="accent-primary"
                  />
                  <span className="text-destructive">
                    No reagendar — cancelación definitiva (el depósito cobrado se retiene)
                  </span>
                </label>
              </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !canConfirm}
            onClick={handleConfirm}
          >
            {isPending
              ? 'Cancelando...'
              : occupants === 0
                ? 'Cancelar vuelo'
                : selection === 'reschedule'
                  ? 'Enviar a reagendar y cancelar vuelo'
                  : selection === 'cancel-all'
                    ? 'Cancelar vuelo y participantes'
                    : `Mover ${occupants} ${occupants === 1 ? 'participante' : 'participantes'} y cancelar vuelo`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
