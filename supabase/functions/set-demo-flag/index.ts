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

  // Clearing the flag on an operator that already signed demo logs is refused.
  //
  // rods_days.is_demo is immutable by design — that is what stops a training
  // log from being laundered into a real §395.8 record. So the flag on the
  // operator and the flag on their certified rows can only ever be made
  // consistent one way: purge the demo logs first (reset-demo-driver), then
  // go live. Allowing the operator to flip while the rows stay demo would
  // leave a live driver whose signed logs are excluded from the retention
  // export forever, which is worse than this 409.
  if (operator.is_demo === true && !isDemo) {
    const { count, error: certErr } = await admin
      .from('rods_days')
      .select('id', { count: 'exact', head: true })
      .eq('operator_id', operatorId)
      .eq('is_demo', true)
      .eq('status', 'certified')
    if (certErr) return fail(500, `Could not check demo duty-status logs: ${certErr.message}`)
    if ((count ?? 0) > 0) {
      return fail(
        409,
        `This demo driver has ${count} certified demo log${count === 1 ? '' : 's'}. ` +
        'Those records can never become real logs. Reset the demo driver to purge them, ' +
        'then take the account live.',
      )
    }
  }

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
