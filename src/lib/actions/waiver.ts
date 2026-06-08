'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { WaiverDocumentType, WaiverFormData, WaiverStatus, Waiver } from '@/types/domain'

// ─── Staff actions (require auth) ────────────────────────────────────────────

/**
 * Creates a PENDING waiver record and returns the signing token (UUID).
 * If a PENDING record already exists for this participant+type, returns the
 * existing token so the QR can be regenerated without creating duplicates.
 */
export async function createWaiverToken(
  participantId: string,
  documentType: WaiverDocumentType
): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('waivers')
    .select('token')
    .eq('participant_id', participantId)
    .eq('document_type', documentType)
    .eq('status', 'PENDING')
    .maybeSingle()

  if (existing) return { token: existing.token }

  const { data, error } = await supabase
    .from('waivers')
    .insert({ participant_id: participantId, document_type: documentType })
    .select('token')
    .single()

  if (error) return { error: error.message }
  return { token: data.token }
}

/**
 * Returns all waivers for a participant, ordered by creation date.
 * Used in the staff UI to show signing status and download PDFs.
 */
export async function getParticipantWaivers(
  participantId: string
): Promise<{ waivers?: Waiver[]; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('waivers')
    .select('*')
    .eq('participant_id', participantId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }

  const waivers: Waiver[] = (data ?? []).map((row) => ({
    id: row.id,
    participantId: row.participant_id,
    token: row.token,
    documentType: row.document_type as WaiverDocumentType,
    status: row.status as WaiverStatus,
    formData: row.form_data as WaiverFormData | null,
    pdfUrl: row.pdf_url,
    signatureUrl: row.signature_url,
    signedAt: row.signed_at,
    createdAt: row.created_at,
  }))

  return { waivers }
}

// ─── Public actions (no auth — called from /waiver/[token]) ──────────────────

/**
 * Fetches a waiver and the participant's name by token.
 * Used by the public signing page to render the correct document.
 */
export async function getWaiverByToken(token: string): Promise<{
  waiver?: Waiver
  participantName?: string
  error?: string
}> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('waivers')
    .select('*, participants!waivers_participant_id_fkey(full_name)')
    .eq('token', token)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'not_found' }

  const waiver: Waiver = {
    id: data.id,
    participantId: data.participant_id,
    token: data.token,
    documentType: data.document_type as WaiverDocumentType,
    status: data.status as WaiverStatus,
    formData: data.form_data as WaiverFormData | null,
    pdfUrl: data.pdf_url,
    signatureUrl: data.signature_url,
    signedAt: data.signed_at,
    createdAt: data.created_at,
  }

  const participantRow = data.participants as { full_name: string } | null
  return { waiver, participantName: participantRow?.full_name }
}

/**
 * Submits a completed waiver.
 * Accepts the PDF and signature as base64 strings, uploads them to Storage,
 * updates the waiver record to COMPLETED, and marks the participant as signed.
 *
 * Only processes waivers in PENDING status — idempotent on re-submission.
 */
export async function submitWaiver(
  token: string,
  formData: WaiverFormData,
  pdfBase64: string,
  signatureBase64: string
): Promise<{ error?: string }> {
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('waivers')
    .select('id, status, participant_id, document_type')
    .eq('token', token)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }
  if (!existing) return { error: 'not_found' }
  if (existing.status === 'COMPLETED') return {}
  if (existing.status === 'EXPIRED') return { error: 'expired' }

  // Build paths: NombreCliente/WAIVER/NombreCliente-YYYY-MM-DD-WAIVER.pdf
  const safeName = (formData.fullName || 'participante')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-zA-Z0-9 ]/g, '')   // remove special chars
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 40)
  const dateStr = new Date().toISOString().split('T')[0]
  const docLabel = existing.document_type  // 'WAIVER' | 'RGPD'
  const baseName = `${safeName}-${dateStr}-${docLabel}`

  // Upload PDF — NombreCliente/WAIVER/NombreCliente-Fecha-WAIVER.pdf
  const pdfPath = `${safeName}/${docLabel}/${baseName}.pdf`
  const pdfBuffer = Buffer.from(pdfBase64, 'base64')
  const { error: pdfError } = await supabase.storage
    .from('waiver-documents')
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (pdfError) return { error: `PDF upload failed: ${pdfError.message}` }

  // Upload signature image — NombreCliente/WAIVER/NombreCliente-Fecha-WAIVER-firma.png
  const sigPath = `${safeName}/${docLabel}/${baseName}-firma.png`
  const sigBuffer = Buffer.from(signatureBase64.replace(/^data:image\/png;base64,/, ''), 'base64')
  const { error: sigError } = await supabase.storage
    .from('waiver-documents')
    .upload(sigPath, sigBuffer, { contentType: 'image/png', upsert: true })

  if (sigError) return { error: `Signature upload failed: ${sigError.message}` }

  // Build signed URLs for permanent reference (10-year expiry)
  const { data: pdfSigned } = await supabase.storage
    .from('waiver-documents')
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10)

  const { data: sigSigned } = await supabase.storage
    .from('waiver-documents')
    .createSignedUrl(sigPath, 60 * 60 * 24 * 365 * 10)

  // Update waiver record
  const { error: updateError } = await supabase
    .from('waivers')
    .update({
      form_data: formData as unknown as import('@/lib/supabase/database.types').Json,
      pdf_url: pdfSigned?.signedUrl ?? pdfPath,
      signature_url: sigSigned?.signedUrl ?? sigPath,
      status: 'COMPLETED',
      accepted: true,
      signed_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  if (updateError) return { error: updateError.message }

  // Mark participant as waiver_signed (only for the WAIVER document type)
  if (existing.document_type === 'WAIVER') {
    await supabase
      .from('participants')
      .update({ waiver_signed: true })
      .eq('id', existing.participant_id)

    revalidatePath('/', 'layout')
  }

  return {}
}
