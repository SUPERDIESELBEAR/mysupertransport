// Public token-gated finalize: driver submits form + signatures + a
// client-rendered PDF. We upload sigs and PDF, update the row, and file the
// executed doc to the operator's Driver Hub.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/)
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: m[1] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let body: {
    token?: string
    passengerName?: string
    passengerRelationship?: string
    passengerDob?: string | null
    effectiveDate?: string | null
    contractorTypedName?: string
    passengerTypedName?: string | null
    parentTypedName?: string | null
    contractorSignature?: string
    passengerSignature?: string | null
    parentSignature?: string | null
    passengerSignatureWaived?: boolean
    passengerWaiverReason?: string | null
    executedPdf?: string
  }
  try { body = await req.json() } catch { return json(400, { error: 'Bad JSON' }) }
  const tok = (body.token || '').trim()
  if (!UUID_RE.test(tok)) return json(400, { error: 'Invalid token' })

  const relationship = (body.passengerRelationship || '').trim()
  const normalizedRelationship = relationship.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const isMinor = normalizedRelationship.includes('minor_child') || normalizedRelationship.includes('minor_passenger')
  const waived = !!body.passengerSignatureWaived || isMinor
  const waiverReason = isMinor
    ? 'Minor child — parent/guardian signature on file (contractor).'
    : (body.passengerWaiverReason || '').trim()
  const baseRequired = ['passengerName', 'passengerRelationship', 'effectiveDate', 'contractorTypedName', 'contractorSignature', 'executedPdf'] as const
  const required = waived
    ? baseRequired
    : ([...baseRequired, 'passengerTypedName', 'passengerSignature'] as const)
  for (const k of required) {
    if (!(body as any)[k]) return json(400, { error: `Missing field: ${k}` })
  }
  if (waived && !waiverReason) {
    return json(400, { error: 'Missing field: passengerWaiverReason' })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: row, error: rowErr } = await admin
    .from('passenger_authorizations')
    .select('id, operator_id, status, driver_name, unit_number')
    .eq('response_token', tok)
    .maybeSingle()
  if (rowErr) return json(500, { error: rowErr.message })
  if (!row) return json(404, { error: 'Not found' })
  if (row.status === 'revoked') return json(410, { error: 'This link is no longer active.' })
  if (row.status === 'signed' || row.status === 'filed') {
    return json(409, { error: 'This authorization has already been signed.' })
  }

  const id = row.id as string

  async function upSig(kind: string, dataUrl: string | null | undefined): Promise<string | null> {
    if (!dataUrl) return null
    const decoded = dataUrlToBytes(dataUrl)
    if (!decoded) return null
    const path = `${id}/${kind}.png`
    const { error } = await admin.storage
      .from('passenger-auth-signatures')
      .upload(path, decoded.bytes, { contentType: 'image/png', upsert: true })
    if (error) throw error
    return path
  }

  let contractorSigPath: string | null = null
  let passengerSigPath: string | null = null
  let parentSigPath: string | null = null
  let executedPath: string | null = null
  try {
    contractorSigPath = await upSig('contractor', body.contractorSignature)
    passengerSigPath = waived ? null : await upSig('passenger', body.passengerSignature)
    parentSigPath = await upSig('parent', body.parentSignature)

    const pdfDecoded = dataUrlToBytes(body.executedPdf!)
    if (!pdfDecoded) return json(400, { error: 'Invalid PDF payload' })
    executedPath = `${id}/passenger-authorization-${Date.now()}.pdf`
    const { error: upErr } = await admin.storage
      .from('passenger-auth-executed')
      .upload(executedPath, pdfDecoded.bytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw upErr
  } catch (e: any) {
    return json(500, { error: `Upload failed: ${e?.message || e}` })
  }

  const nowIso = new Date().toISOString()

  const { data: signed } = await admin.storage
    .from('passenger-auth-executed')
    .createSignedUrl(executedPath!, 60 * 60 * 24 * 365 * 5)
  const executedUrl = signed?.signedUrl || null

  const { error: updErr } = await admin
    .from('passenger_authorizations')
    .update({
      status: row.operator_id ? 'filed' : 'signed',
      passenger_name: body.passengerName,
      passenger_relationship: body.passengerRelationship,
      passenger_dob: body.passengerDob || null,
      effective_date: body.effectiveDate || null,
      contractor_typed_name: body.contractorTypedName,
      passenger_typed_name: body.passengerTypedName || null,
      parent_typed_name: body.parentTypedName || null,
      contractor_signature_url: contractorSigPath,
      passenger_signature_url: passengerSigPath,
      parent_signature_url: parentSigPath,
      contractor_signed_at: nowIso,
      executed_pdf_url: executedUrl,
      executed_at: nowIso,
      passenger_signature_waived: waived,
      passenger_waiver_reason: waived ? waiverReason : null,
    })
    .eq('id', id)
  if (updErr) return json(500, { error: updErr.message })

  if (row.operator_id && executedUrl) {
    const { data: docRow, error: docErr } = await admin
      .from('operator_documents')
      .insert({
        operator_id: row.operator_id,
        document_type: 'other',
        file_url: executedUrl,
        file_name: `Passenger Authorization — Unit ${row.unit_number}.pdf`,
      })
      .select('id')
      .single()
    if (!docErr && docRow) {
      await admin
        .from('passenger_authorizations')
        .update({ filed_operator_document_id: docRow.id })
        .eq('id', id)
    } else if (docErr) {
      console.error('operator_documents insert failed', docErr)
    }
  }

  return json(200, { ok: true, executedUrl })
})