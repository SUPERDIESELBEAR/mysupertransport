// Staff-only: cancels a pending Passenger Authorization request so it stops
// showing on the driver's home screen. Signed/filed records can never be
// revoked — they are compliance records.
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return json(401, { error: 'Missing bearer token' })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) return json(401, { error: 'Invalid session' })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: isStaff } = await admin.rpc('is_staff', { _user_id: userData.user.id })
  if (!isStaff) return json(403, { error: 'Staff only' })

  let body: { id?: string; reason?: string }
  try { body = await req.json() } catch { return json(400, { error: 'Bad JSON' }) }
  const id = (body.id || '').trim()
  if (!UUID_RE.test(id)) return json(400, { error: 'Invalid id' })
  const reason = (body.reason || '').trim().slice(0, 500) || null

  const { data: row, error: rowErr } = await admin
    .from('passenger_authorizations')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (rowErr) return json(500, { error: rowErr.message })
  if (!row) return json(404, { error: 'Not found' })
  if (row.status === 'signed' || row.status === 'filed') {
    return json(409, { error: 'Signed authorizations cannot be cancelled.' })
  }
  if (row.status === 'revoked') return json(200, { ok: true, alreadyRevoked: true })

  const nowIso = new Date().toISOString()
  const { error: updErr } = await admin
    .from('passenger_authorizations')
    .update({
      status: 'revoked',
      revoked_at: nowIso,
      revoked_by: userData.user.id,
      revoke_reason: reason,
    })
    .eq('id', id)
  if (updErr) return json(500, { error: updErr.message })

  // Dismiss the driver's in-app task so the bell doesn't keep an orphan item.
  const { error: notifErr } = await admin
    .from('notifications')
    .update({ archived_at: nowIso, read_at: nowIso })
    .eq('entity_type', 'passenger_authorization')
    .eq('entity_id', id)
    .is('archived_at', null)
  if (notifErr) console.error('notification archive failed', notifErr)

  return json(200, { ok: true })
})