// Public, token-gated endpoint that returns the data needed to render an
// applicant's signed Fair Credit Reporting Act authorization for the
// previous employer who received a PEI request. The caller proves
// authority by presenting the unguessable response_token from the PEI
// email. We never expose application data unless that token resolves to
// an active (non-revoked) PEI request.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractStoragePath(url: string, bucket: string): string | null {
  if (!url) return null
  if (!url.startsWith('http')) return url
  for (const marker of [
    `/object/public/${bucket}/`,
    `/storage/v1/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ]) {
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const tail = url.slice(idx + marker.length)
      // strip query string from signed URLs
      return tail.split('?')[0]
    }
  }
  return null
}

async function fetchSignatureDataUrl(
  supabase: ReturnType<typeof createClient>,
  rawUrl: string | null,
): Promise<string | null> {
  if (!rawUrl) return null
  const path = extractStoragePath(rawUrl, 'signatures')
  if (!path) return null
  try {
    const { data, error } = await supabase.storage
      .from('signatures')
      .download(path)
    if (error || !data) return null
    const buf = new Uint8Array(await data.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    const b64 = btoa(binary)
    const mime = data.type || 'image/png'
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')
    return json(405, { error: 'Method not allowed' })

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }
  const token = (body.token || '').trim()
  if (!UUID_RE.test(token)) return json(400, { error: 'Invalid token' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: pei, error: peiErr } = await supabase
    .from('pei_requests')
    .select('id, application_id, status, employer_name, response_token_used')
    .eq('response_token', token)
    .maybeSingle()
  if (peiErr) return json(500, { error: peiErr.message })
  if (!pei) return json(404, { error: 'Release link is invalid or has been revoked.' })
  if (pei.status === 'revoked')
    return json(410, { error: 'This release link is no longer active.' })

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select(
      'id, first_name, last_name, email, dob, typed_full_name, signed_date, signature_image_url, auth_safety_history, auth_drug_alcohol, auth_previous_employers',
    )
    .eq('id', pei.application_id)
    .maybeSingle()
  if (appErr) return json(500, { error: appErr.message })
  if (!app)
    return json(404, { error: 'Application not found for this release link.' })
  if (!app.signed_date)
    return json(409, {
      error: 'No signed authorization is on file for this applicant yet.',
    })

  const signatureDataUrl = await fetchSignatureDataUrl(
    supabase,
    app.signature_image_url,
  )

  // Best-effort audit trail — never let logging failure block the view.
  try {
    await supabase.from('audit_log').insert({
      action: 'pei_release_viewed',
      entity_type: 'pei_request',
      entity_id: pei.id,
      metadata: {
        application_id: pei.application_id,
        employer_name: pei.employer_name,
        ip:
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          req.headers.get('cf-connecting-ip') ||
          null,
        user_agent: req.headers.get('user-agent') || null,
      },
    })
  } catch (_) {
    /* non-fatal */
  }

  return json(200, {
    application: {
      id: app.id,
      first_name: app.first_name,
      last_name: app.last_name,
      email: app.email,
      dob: app.dob,
      typed_full_name: app.typed_full_name,
      signed_date: app.signed_date,
      signature_image_url: null, // never expose raw URL to browser
    },
    signatureDataUrl,
    pei: {
      employer_name: pei.employer_name,
      status: pei.status,
    },
  })
})