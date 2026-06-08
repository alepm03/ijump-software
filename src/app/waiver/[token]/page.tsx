import { getWaiverByToken } from '@/lib/actions/waiver'
import WaiverSigningForm from './WaiverSigningForm'

export default async function WaiverPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { waiver, participantName, error } = await getWaiverByToken(token)

  if (error === 'not_found' || !waiver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Enlace no válido</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Este enlace no existe o ya no es válido. Pide al personal del centro que genere uno nuevo.
        </p>
      </div>
    )
  }

  if (waiver.status === 'EXPIRED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Enlace caducado</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Este enlace ha caducado. Pide al personal del centro que genere uno nuevo.
        </p>
      </div>
    )
  }

  if (waiver.status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Ya firmado</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Este documento ya fue firmado correctamente. Puedes cerrar esta ventana.
        </p>
      </div>
    )
  }

  return (
    <WaiverSigningForm
      waiver={waiver}
      participantName={participantName ?? 'Participante'}
    />
  )
}
