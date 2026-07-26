// Staff-only: creates a passenger_authorizations row and emails the driver a
// tokenized link to sign it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildAppUrl } from '../_shared/email/index.ts'

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
    /** Re-email an existing pending request instead of creating a new one. */
    resendId?: string
    /** Revoke any existing pending request for this driver, then send fresh. */
    replaceExisting?: boolean
  }
  try { body = await req.json() } catch { return json(400, { error: 'Bad JSON' }) }

  const nowIso = new Date().toISOString()

  // ---- Resend path: re-email the existing link, no new row, no new card ----
  if (body.resendId) {
    const { data: existing, error: exErr } = await admin
      .from('passenger_authorizations')
      .select('id, response_token, driver_name, unit_number, driver_email, status')
      .eq('id', body.resendId)
      .maybeSingle()
    if (exErr) return json(500, { error: exErr.message })
    if (!existing) return json(404, { error: 'Not found' })
    if (!['sent', 'opened'].includes(existing.status as string)) {
      return json(409, { error: 'Only pending requests can be resent.' })
    }
    const url = buildAppUrl(`/passenger-auth/${existing.response_token}`)
    const { error: reErr } = await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'passenger-auth-request',
        recipientEmail: existing.driver_email,
        idempotencyKey: `passenger-auth-${existing.id}-${Date.now()}`,
        templateData: {
          driverName: existing.driver_name,
          unitNumber: existing.unit_number,
          responseUrl: url,
        },
      },
    })
    if (reErr) console.error('resend email failed', reErr)
    await admin
      .from('passenger_authorizations')
      .update({ sent_at: nowIso })
      .eq('id', existing.id)
    return json(200, { id: existing.id, responseUrl: url, resent: true })
  }

  const driverName = (body.driverName || '').trim()
  const unitNumber = (body.unitNumber || '').trim()
  const driverEmail = (body.driverEmail || '').trim().toLowerCase()
  if (!driverName || !unitNumber || !driverEmail) {
    return json(400, { error: 'driverName, unitNumber, and driverEmail are required' })
  }

  // ---- One open request per driver ----
  // A driver may hold unlimited SIGNED authorizations (different passengers,
  // yearly renewals), but only one unsigned request at a time.
  if (body.operatorId) {
    const { data: pending } = await admin
      .from('passenger_authorizations')
      .select('id, created_at, status, driver_name')
      .eq('operator_id', body.operatorId)
      .in('status', ['sent', 'opened'])
      .order('created_at', { ascending: false })

    if (pending && pending.length > 0) {
      if (!body.replaceExisting) {
        return json(409, {
          error: 'pending_request_exists',
          pending: pending.map(p => ({
            id: p.id,
            createdAt: p.created_at,
            status: p.status,
          })),
        })
      }
      const ids = pending.map(p => p.id)
      await admin
        .from('passenger_authorizations')
        .update({
          status: 'revoked',
          revoked_at: nowIso,
          revoked_by: userData.user.id,
          revoke_reason: 'Replaced by a newer Passenger Authorization request.',
        })
        .in('id', ids)
      await admin
        .from('notifications')
        .update({ archived_at: nowIso, read_at: nowIso })
        .eq('entity_type', 'passenger_authorization')
        .in('entity_id', ids)
        .is('archived_at', null)
    }
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

  const responseUrl = buildAppUrl(`/passenger-auth/${row.response_token}`)

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