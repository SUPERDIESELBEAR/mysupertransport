// Public token-gated fetch of a passenger_authorizations row so the driver
// can pre-fill the signing page.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let body: { token?: string }
  try { body = await req.json() } catch { return json(400, { error: 'Bad JSON' }) }
  const tok = (body.token || '').trim()
  if (!UUID_RE.test(tok)) return json(400, { error: 'Invalid token' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: row, error } = await admin
    .from('passenger_authorizations')
    .select('id, driver_name, unit_number, status, passenger_name, passenger_relationship, passenger_dob, effective_date, contractor_typed_name, passenger_typed_name, parent_typed_name, executed_pdf_url')
    .eq('response_token', tok)
    .maybeSingle()
  if (error) return json(500, { error: error.message })
  if (!row) return json(404, { error: 'Not found' })
  if (row.status === 'revoked') return json(410, { error: 'This link is no longer active.' })

  if (row.status === 'sent') {
    await admin
      .from('passenger_authorizations')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  return json(200, { authorization: row })
})