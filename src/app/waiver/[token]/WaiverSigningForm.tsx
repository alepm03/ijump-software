'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { submitWaiver } from '@/lib/actions/waiver'
import { getWaiverTemplate } from '@/lib/waiver-templates/registry'
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
  const template = getWaiverTemplate(documentType)
  const { title, legalText, fields, checkboxes: checkboxGroup } = template

  // Form state
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  )
  // One map for the template's checkbox group, whichever field it lands in.
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((checkboxGroup?.items ?? []).map((c) => [c.key, false]))
  )
  const [hasSignature, setHasSignature] = useState(false)
  // Witness (RGPD only) — one witness, not the paper's original two. Usually
  // someone from the participant's own group; Ana (administración) signs as
  // fallback when nobody else is available.
  const [witnessName, setWitnessName] = useState('')
  const [witnessDni, setWitnessDni] = useState('')
  const [witnessAge, setWitnessAge] = useState('')
  const [hasWitnessSignature, setHasWitnessSignature] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const witnessCanvasRef = useRef<HTMLCanvasElement>(null)

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  function clearWitnessSignature() {
    const canvas = witnessCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasWitnessSignature(false)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}

    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) {
        next[field.key] = 'Campo obligatorio'
      }
    }

    if (checkboxGroup) {
      if (checkboxGroup.allRequired) {
        // One error for the whole group: listing every unticked line when all
        // of them are mandatory just repeats the heading.
        if (!checkboxGroup.items.every((c) => checks[c.key])) {
          next['checkboxes'] = 'Debes confirmar todos los puntos'
        }
      } else {
        for (const c of checkboxGroup.items) {
          if (c.required && !checks[c.key]) next[c.key] = 'Este consentimiento es obligatorio'
        }
      }
    }

    if (template.witness) {
      if (!witnessName.trim()) next['witnessName'] = 'Campo obligatorio'
      if (!witnessDni.trim()) next['witnessDni'] = 'Campo obligatorio'
      if (!witnessAge.trim()) next['witnessAge'] = 'Campo obligatorio'
      if (!hasWitnessSignature) next['witnessSignature'] = 'La firma del testigo es obligatoria'
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
        province: values['province'] || undefined,
        emergencyContactName: values['emergencyContactName'] || undefined,
        emergencyContactPhone: values['emergencyContactPhone'] || undefined,
        emergencyContactRelationship: values['emergencyContactRelationship'] || undefined,
        sportsLicenseNumber: values['sportsLicenseNumber'] || undefined,
        postalCode: values['postalCode'] || undefined,
        city: values['city'] || undefined,
        memberCategory: values['memberCategory'] || undefined,
        memberCategoryOther: values['memberCategoryOther'] || undefined,
        healthDeclaration: checkboxGroup?.field === 'healthDeclaration' ? checks : undefined,
        consents: checkboxGroup?.field === 'consents' ? checks : undefined,
        witnessName: template.witness ? witnessName.trim() : undefined,
        witnessDni: template.witness ? witnessDni.trim() : undefined,
        witnessAge: template.witness ? witnessAge.trim() : undefined,
      }

      const signatureDataUrl = canvasRef.current!.toDataURL('image/png')
      const witnessSignatureDataUrl = template.witness
        ? witnessCanvasRef.current!.toDataURL('image/png')
        : undefined

      const result = await submitWaiver(waiver.token, formData, signatureDataUrl, witnessSignatureDataUrl)

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
              {field.type === 'select' ? (
                <select
                  value={values[field.key] ?? ''}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [field.key]: e.target.value }))
                    if (errors[field.key]) setErrors((err) => { const n = { ...err }; delete n[field.key]; return n })
                  }}
                  className={`w-full rounded-xl border bg-background px-4 py-3 text-foreground text-base outline-none transition focus:ring-2 focus:ring-primary/30 ${errors[field.key] ? 'border-destructive' : 'border-border'}`}
                >
                  <option value="">Selecciona una opción</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
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
              )}
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
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {legalText}
            </p>
          </div>
        </section>

        {/* Checkbox group — whichever one this document declares */}
        {checkboxGroup && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {checkboxGroup.sectionTitle}
            </h2>
            {checkboxGroup.intro && (
              <p className="text-xs text-muted-foreground">{checkboxGroup.intro}</p>
            )}
            <div className={checkboxGroup.allRequired ? 'space-y-3' : 'space-y-4'}>
              {checkboxGroup.items.map((item) => (
                <div key={item.key}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checks[item.key] ?? false}
                      onChange={(e) => {
                        setChecks((c) => ({ ...c, [item.key]: e.target.checked }))
                        const errorKey = checkboxGroup.allRequired ? 'checkboxes' : item.key
                        if (errors[errorKey]) {
                          setErrors((err) => { const n = { ...err }; delete n[errorKey]; return n })
                        }
                      }}
                      className="mt-0.5 w-5 h-5 rounded accent-primary flex-shrink-0"
                    />
                    <span className="text-sm text-foreground leading-snug">
                      {checkboxGroup.allRequired ? (
                        item.label
                      ) : (
                        <>
                          <span className="font-medium">{item.label}</span>
                          {!item.required && (
                            <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                          )}
                          {item.description && (
                            <>
                              <br />
                              <span className="text-muted-foreground text-xs">{item.description}</span>
                            </>
                          )}
                        </>
                      )}
                    </span>
                  </label>
                  {errors[item.key] && (
                    <p className="text-xs text-destructive mt-1 ml-8">{errors[item.key]}</p>
                  )}
                </div>
              ))}
            </div>
            {errors['checkboxes'] && (
              <p className="text-xs text-destructive">{errors['checkboxes']}</p>
            )}
          </section>
        )}

        {/* Witness (RGPD) — one witness, not the paper's original two */}
        {template.witness && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Testigo
            </h2>
            <p className="text-xs text-muted-foreground">
              Necesitamos los datos y la firma de una persona que sea testigo de esta firma
              (puede ser alguien de tu grupo, o el equipo de iJump si vienes solo/a).
            </p>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Nombre completo<span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={witnessName}
                onChange={(e) => {
                  setWitnessName(e.target.value)
                  if (errors['witnessName']) setErrors((err) => { const n = { ...err }; delete n['witnessName']; return n })
                }}
                className={`w-full rounded-xl border bg-background px-4 py-3 text-foreground text-base outline-none transition focus:ring-2 focus:ring-primary/30 ${errors['witnessName'] ? 'border-destructive' : 'border-border'}`}
                autoComplete="off"
              />
              {errors['witnessName'] && (
                <p className="text-xs text-destructive mt-1">{errors['witnessName']}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  DNI<span className="text-destructive ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={witnessDni}
                  onChange={(e) => {
                    setWitnessDni(e.target.value)
                    if (errors['witnessDni']) setErrors((err) => { const n = { ...err }; delete n['witnessDni']; return n })
                  }}
                  className={`w-full rounded-xl border bg-background px-4 py-3 text-foreground text-base outline-none transition focus:ring-2 focus:ring-primary/30 ${errors['witnessDni'] ? 'border-destructive' : 'border-border'}`}
                  autoComplete="off"
                />
                {errors['witnessDni'] && (
                  <p className="text-xs text-destructive mt-1">{errors['witnessDni']}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Edad<span className="text-destructive ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={witnessAge}
                  onChange={(e) => {
                    setWitnessAge(e.target.value)
                    if (errors['witnessAge']) setErrors((err) => { const n = { ...err }; delete n['witnessAge']; return n })
                  }}
                  className={`w-full rounded-xl border bg-background px-4 py-3 text-foreground text-base outline-none transition focus:ring-2 focus:ring-primary/30 ${errors['witnessAge'] ? 'border-destructive' : 'border-border'}`}
                  autoComplete="off"
                />
                {errors['witnessAge'] && (
                  <p className="text-xs text-destructive mt-1">{errors['witnessAge']}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-foreground">
                Firma del testigo<span className="text-destructive ml-0.5">*</span>
              </label>
              {hasWitnessSignature && (
                <button
                  type="button"
                  onClick={clearWitnessSignature}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  Borrar
                </button>
              )}
            </div>
            <SignatureCanvas onHasSignatureChange={setHasWitnessSignature} canvasRef={witnessCanvasRef} />
            {errors['witnessSignature'] && (
              <p className="text-xs text-destructive">{errors['witnessSignature']}</p>
            )}
          </section>
        )}

        {/* Signature */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {template.witness ? 'Tu firma' : 'Firma'}
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
