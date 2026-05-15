// Public, token-gated endpoint that records an interaction event for a PEI
// request (response link opened, FCRA release opened, response submitted).
// IP and user-agent are derived server-side from request headers — never
// trusted from the client body.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_EVENTS = new Set([
  'opened_response_link',
  'opened_release_link',
  'submitted',
])

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let body: { token?: string; event_type?: string; response_id?: string; metadata?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const token = (body.token || '').trim()
  const eventType = (body.event_type || '').trim()
  if (!UUID_RE.test(token)) return json(400, { error: 'Invalid token' })
  if (!ALLOWED_EVENTS.has(eventType)) return json(400, { error: 'Invalid event_type' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Resolve token -> request id (do NOT leak existence on miss).
  const { data: reqRow } = await supabase
    .from('pei_requests')
    .select('id')
    .eq('response_token', token)
    .maybeSingle()
  if (!reqRow) return json(200, { ok: true })

  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')
  const metadata: Record<string, unknown> = { ...(body.metadata ?? {}) }
  if (body.response_id && UUID_RE.test(body.response_id)) {
    metadata.response_id = body.response_id
  }

  const { error } = await supabase.from('pei_request_events').insert({
    pei_request_id: (reqRow as { id: string }).id,
    event_type: eventType,
    ip_address: ip,
    user_agent: ua,
    metadata: Object.keys(metadata).length ? metadata : null,
  })
  if (error) {
    console.error('[log-pei-event] insert failed', error)
    return json(500, { error: 'log_failed' })
  }

  // If this was a submission, also stamp signed_ip/UA on the response row
  // (the RPC stores what the client sent; we override with server-derived values).
  if (eventType === 'submitted' && body.response_id && UUID_RE.test(body.response_id)) {
    await supabase
      .from('pei_responses')
      .update({ signed_ip: ip, signed_user_agent: ua })
      .eq('id', body.response_id)
  }

  return json(200, { ok: true, ip, ua })
})