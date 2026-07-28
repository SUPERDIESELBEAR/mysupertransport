import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Flips the is_demo flag on an EXISTING operator (and its application + profile)
// so a real driver record can be used as a sandbox account, or returned to live.
// Never deletes or reseeds any data.

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth

  let body: any
  try { body = await req.json() } catch { return fail(400, 'Invalid JSON body') }

  const operatorId = String(body?.operatorId ?? '').trim()
  if (!operatorId) return fail(400, 'operatorId is required')
  const isDemo = body?.isDemo === true
  const demoLabel = body?.demoLabel ? String(body.demoLabel).trim().slice(0, 120) : null

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: operator, error: opErr } = await admin
    .from('operators')
    .select('id, application_id, user_id, is_demo')
    .eq('id', operatorId)
    .maybeSingle()
  if (opErr) return fail(500, `Could not load operator: ${opErr.message}`)
  if (!operator) return fail(404, 'Operator not found')

  const { error: updErr } = await admin.from('operators').update({
    is_demo: isDemo,
    demo_label: isDemo ? demoLabel : null,
    demo_scenario: isDemo ? (body?.demoScenario ?? null) : null,
    demo_owner_user_id: isDemo ? auth.userId : null,
  }).eq('id', operatorId)
  if (updErr) return fail(500, `Could not update operator: ${updErr.message}`)

  if (operator.application_id) {
    const { error } = await admin.from('applications')
      .update({ is_demo: isDemo }).eq('id', operator.application_id)
    if (error) console.error('set-demo-flag: application update failed', error.message)
  }

  if (operator.user_id) {
    const { error } = await admin.from('profiles')
      .update({ is_demo: isDemo }).eq('user_id', operator.user_id)
    if (error) console.error('set-demo-flag: profile update failed', error.message)
  }

  return ok({ operatorId, isDemo })
}))
