// Staff-only: creates a passenger_authorizations row and emails the driver a
// tokenized link to sign it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SITE_URL = 'https://mysupertransport.lovable.app'

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

  let body: {
    operatorId?: string | null
    driverName?: string
    unitNumber?: string
    driverEmail?: string
  }
  try { body = await req.json() } catch { return json(400, { error: 'Bad JSON' }) }

  const driverName = (body.driverName || '').trim()
  const unitNumber = (body.unitNumber || '').trim()
  const driverEmail = (body.driverEmail || '').trim().toLowerCase()
  if (!driverName || !unitNumber || !driverEmail) {
    return json(400, { error: 'driverName, unitNumber, and driverEmail are required' })
  }

  const { data: carrier } = await admin
    .from('carrier_signature_settings')
    .select('signature_url, typed_name, title')
    .maybeSingle()

  const { data: row, error: insErr } = await admin
    .from('passenger_authorizations')
    .insert({
      operator_id: body.operatorId ?? null,
      driver_name: driverName,
      unit_number: unitNumber,
      driver_email: driverEmail,
      sent_by: userData.user.id,
      carrier_signature_url: carrier?.signature_url ?? null,
      carrier_typed_name: carrier?.typed_name ?? null,
      carrier_title: carrier?.title ?? null,
    })
    .select('id, response_token')
    .single()
  if (insErr || !row) return json(500, { error: insErr?.message || 'Insert failed' })

  const responseUrl = `${SITE_URL}/passenger-auth/${row.response_token}`

  // In-app task: create a notification for the linked driver so the request
  // surfaces inside SUPERDRIVE alongside the email link.
  if (body.operatorId) {
    const { data: op, error: opErr } = await admin
      .from('operators')
      .select('user_id')
      .eq('id', body.operatorId)
      .maybeSingle()
    console.log('operator lookup', { operatorId: body.operatorId, user_id: op?.user_id, opErr })
    if (op?.user_id) {
      const { error: notifErr } = await admin.from('notifications').insert({
        user_id: op.user_id,
        type: 'assignment',
        title: 'Passenger Authorization required',
        body: `Complete the Passenger Authorization for Unit ${unitNumber} and sign the form.`,
        link: `/passenger-auth/${row.response_token}`,
        entity_type: 'passenger_authorization',
        entity_id: row.id,
        priority: 'action',
        channel: 'in_app',
      })
      if (notifErr) console.error('notification insert failed', notifErr)
      else console.log('notification inserted for user', op.user_id)
    }
  }

  const { error: sendErr } = await admin.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'passenger-auth-request',
      recipientEmail: driverEmail,
      idempotencyKey: `passenger-auth-${row.id}`,
      templateData: { driverName, unitNumber, responseUrl },
    },
  })
  if (sendErr) console.error('email send failed', sendErr)

  return json(200, { id: row.id, responseUrl })
})