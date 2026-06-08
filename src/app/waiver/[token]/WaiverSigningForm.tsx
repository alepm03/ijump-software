'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { submitWaiver } from '@/lib/actions/waiver'
import { generateWaiverPdf } from '@/lib/generate-waiver-pdf'
import { WAIVER_FIELDS, HEALTH_ITEMS, WAIVER_LEGAL_TEXT, WAIVER_TITLE } from '@/lib/waiver-templates/waiver'
import { RGPD_FIELDS, CONSENT_ITEMS, RGPD_LEGAL_TEXT, RGPD_TITLE } from '@/lib/waiver-templates/rgpd'
import type { Waiver, WaiverDocumentType, WaiverFormData } from '@/types/domain'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  waiver: Waiver
  participantName: string
}

// ─── Signature canvas ─────────────────────────────────────────────────────────

function SignatureCanvas({
  onHasSignatureChange,
  canvasRef,
}: {
  onHasSignatureChange: (has: boolean) => void
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const isDrawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [canvasRef])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    isDrawing.current = true
    const p = getPoint(e)
    lastPoint.current = p
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
    ctx.fill()
    onHasSignatureChange(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPoint.current = p
  }

  function onPointerUp() {
    isDrawing.current = false
    lastPoint.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-36 rounded-xl border-2 border-dashed border-border bg-white cursor-crosshair touch-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WaiverSigningForm({ waiver, participantName }: Props) {
  const documentType = waiver.documentType
  const isWaiver = documentType === 'WAIVER'

  const fields = isWaiver ? WAIVER_FIELDS : RGPD_FIELDS
  const title = isWaiver ? WAIVER_TITLE : RGPD_TITLE
  const legalText = isWaiver ? WAIVER_LEGAL_TEXT : RGPD_LEGAL_TEXT

  // Form state
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  )
  const [health, setHealth] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(HEALTH_ITEMS).map((k) => [k, false]))
  )
  const [consents, setConsents] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CONSENT_ITEMS.map((c) => [c.key, false]))
  )
  const [hasSignature, setHasSignature] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}

    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) {
        next[field.key] = 'Campo obligatorio'
      }
    }

    if (isWaiver) {
      const allHealthChecked = Object.values(health).every(Boolean)
      if (!allHealthChecked) next['health'] = 'Debes confirmar todos los puntos de salud'
    } else {
      const requiredConsents = CONSENT_ITEMS.filter((c) => c.required)
      for (const c of requiredConsents) {
        if (!consents[c.key]) next[c.key] = 'Este consentimiento es obligatorio'
      }
    }

    if (!hasSignature) next['signature'] = 'La firma es obligatoria'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const formData: WaiverFormData = {
        fullName: values['fullName'] ?? '',
        email: values['email'] ?? '',
        phone: values['phone'] || undefined,
        dni: values['dni'] || undefined,
        dateOfBirth: values['dateOfBirth'] || undefined,
        address: values['address'] || undefined,
        emergencyContactName: values['emergencyContactName'] || undefined,
        emergencyContactPhone: values['emergencyContactPhone'] || undefined,
        healthDeclaration: isWaiver ? health : undefined,
        dataProcessingConsent: !isWaiver ? consents['dataProcessingConsent'] : undefined,
        imageRightsConsent: !isWaiver ? consents['imageRightsConsent'] : undefined,
        marketingConsent: !isWaiver ? consents['marketingConsent'] : undefined,
      }

      const signatureDataUrl = canvasRef.current!.toDataURL('image/png')

      const pdfBase64 = await generateWaiverPdf(
        documentType,
        formData,
        signatureDataUrl,
        participantName
      )

      const result = await submitWaiver(waiver.token, formData, pdfBase64, signatureDataUrl)

      if (result.error) {
        setSubmitError('Ha ocurrido un error al enviar el documento. Por favor, inténtalo de nuevo.')
      } else {
        setDone(true)
      }
    } catch {
      setSubmitError('Error inesperado. Por favor, inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">¡Documento firmado!</h1>
        <p className="text-muted-foreground max-w-sm">
          Hemos recibido tu firma correctamente. Puedes cerrar esta ventana.
        </p>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-4">
        <p className="text-sm font-medium opacity-80">iJump</p>
        <h1 className="text-lg font-bold leading-tight mt-0.5">{title}</h1>
        <p className="text-sm opacity-75 mt-1">Hola, {participantName}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="px-5 py-6 space-y-8 max-w-xl mx-auto pb-12">

        {/* Personal data */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Datos personales
          </h2>
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-foreground mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <input
                type={field.type}
                value={values[field.key] ?? ''}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                  if (errors[field.key]) setErrors((err) => { const n = { ...err }; delete n[field.key]; return n })
                }}
                className={`w-full rounded-xl border bg-background px-4 py-3 text-foreground text-base outline-none transition focus:ring-2 focus:ring-primary/30 ${errors[field.key] ? 'border-destructive' : 'border-border'}`}
                autoComplete="off"
              />
              {errors[field.key] && (
                <p className="text-xs text-destructive mt-1">{errors[field.key]}</p>
              )}
            </div>
          ))}
        </section>

        {/* Legal text */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Texto legal
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 h-48 overflow-y-auto">
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {legalText}
            </p>
          </div>
        </section>

        {/* Health declaration (WAIVER) */}
        {isWaiver && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Declaración de salud
            </h2>
            <p className="text-xs text-muted-foreground">
              Confirma que se aplican a ti todos los puntos siguientes:
            </p>
            <div className="space-y-3">
              {Object.entries(HEALTH_ITEMS).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={health[key] ?? false}
                    onChange={(e) => {
                      setHealth((h) => ({ ...h, [key]: e.target.checked }))
                      if (errors['health']) setErrors((err) => { const n = { ...err }; delete n['health']; return n })
                    }}
                    className="mt-0.5 w-5 h-5 rounded accent-primary flex-shrink-0"
                  />
                  <span className="text-sm text-foreground leading-snug">{label}</span>
                </label>
              ))}
            </div>
            {errors['health'] && (
              <p className="text-xs text-destructive">{errors['health']}</p>
            )}
          </section>
        )}

        {/* Consent items (RGPD) */}
        {!isWaiver && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Consentimientos
            </h2>
            <div className="space-y-4">
              {CONSENT_ITEMS.map((item) => (
                <div key={item.key}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consents[item.key] ?? false}
                      onChange={(e) => {
                        setConsents((c) => ({ ...c, [item.key]: e.target.checked }))
                        if (errors[item.key]) setErrors((err) => { const n = { ...err }; delete n[item.key]; return n })
                      }}
                      className="mt-0.5 w-5 h-5 rounded accent-primary flex-shrink-0"
                    />
                    <span className="text-sm text-foreground leading-snug">
                      <span className="font-medium">{item.label}</span>
                      {!item.required && (
                        <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                      )}
                      <br />
                      <span className="text-muted-foreground text-xs">{item.description}</span>
                    </span>
                  </label>
                  {errors[item.key] && (
                    <p className="text-xs text-destructive mt-1 ml-8">{errors[item.key]}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Signature */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Firma
            </h2>
            {hasSignature && (
              <button
                type="button"
                onClick={clearSignature}
                className="text-xs text-muted-foreground hover:text-foreground transition"
              >
                Borrar
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Dibuja tu firma en el recuadro de abajo con el dedo o el ratón.
          </p>
          <SignatureCanvas onHasSignatureChange={setHasSignature} canvasRef={canvasRef} />
          {errors['signature'] && (
            <p className="text-xs text-destructive">{errors['signature']}</p>
          )}
        </section>

        {/* Submit error */}
        {submitError && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold text-base py-4 transition hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enviando...' : 'Firmar y enviar'}
        </button>

        <p className="text-xs text-muted-foreground text-center pb-4">
          Al firmar confirmas que has leído y aceptas el documento anterior.
        </p>
      </form>
    </div>
  )
}
