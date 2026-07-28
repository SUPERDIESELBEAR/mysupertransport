import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'
import {
  isDemoScenario,
  onboardingStatusForScenario,
  applicationStatusForScenario,
  type DemoScenario,
} from '../_shared/demo-scenarios.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Resets a demo driver back to a chosen lifecycle scenario. Refuses to touch
// any operator that is not flagged is_demo, so live drivers can never be wiped.

// Child tables cleared on every reset, keyed by operator_id.
const OPERATOR_SCOPED_TABLES = [
  'onboard_assignment_sheet_items',
  'onboard_assignment_sheets',
  'equipment_receipts',
  'equipment_assignments',
  'operator_documents',
  'operator_offboarding_steps',
  'ica_amendments',
  'ica_contracts',
  'dispatch_daily_log',
  'dispatch_status_history',
  'contractor_pay_setup',
  'cert_reminders',
]

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  const { userId } = auth

  let body: any
  try { body = await req.json() } catch { return fail(400, 'Invalid JSON body') }

  const operatorId = String(body?.operatorId ?? '').trim()
  if (!operatorId) return fail(400, 'operatorId is required')
  const scenario: DemoScenario = isDemoScenario(body?.scenario) ? body.scenario : 'blank'

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: operator, error: opErr } = await admin
    .from('operators')
    .select('id, application_id, is_demo, user_id')
    .eq('id', operatorId)
    .maybeSingle()
  if (opErr) return fail(500, `Could not load operator: ${opErr.message}`)
  if (!operator) return fail(404, 'Operator not found')
  if (operator.is_demo !== true) return fail(403, 'Refusing to reset a live (non-demo) driver')

  // 1. Clear operator-scoped activity.
  for (const table of OPERATOR_SCOPED_TABLES) {
    const { error } = await admin.from(table as any).delete().eq('operator_id', operatorId)
    if (error) console.error(`reset-demo-driver: failed clearing ${table}`, error.message)
  }

  // 2. Reset onboarding status to the scenario snapshot.
  const statusPayload = onboardingStatusForScenario(scenario)
  const { data: existingStatus } = await admin
    .from('onboarding_status').select('id').eq('operator_id', operatorId).maybeSingle()
  if (existingStatus) {
    const { error } = await admin.from('onboarding_status')
      .update(statusPayload).eq('operator_id', operatorId)
    if (error) return fail(500, `Could not reset onboarding status: ${error.message}`)
  } else {
    const { error } = await admin.from('onboarding_status')
      .insert({ operator_id: operatorId, ...statusPayload })
    if (error) return fail(500, `Could not create onboarding status: ${error.message}`)
  }

  // 3. Reset the application review state.
  if (operator.application_id) {
    const appStatus = applicationStatusForScenario(scenario)
    await admin.from('applications').update({
      review_status: appStatus.review_status,
      is_draft: appStatus.is_draft,
      reviewed_at: appStatus.review_status === 'approved' ? new Date().toISOString() : null,
    }).eq('id', operator.application_id)
  }

  // 4. Reset operator + dispatch state.
  await admin.from('operators').update({
    is_active: scenario !== 'blank',
    demo_scenario: scenario,
    on_hold: false,
    on_hold_reason: null,
    on_hold_date: null,
  }).eq('id', operatorId)

  const { data: dispatch } = await admin
    .from('active_dispatch').select('id').eq('operator_id', operatorId).maybeSingle()
  if (dispatch) {
    await admin.from('active_dispatch')
      .update({ dispatch_status: 'not_dispatched', updated_by: userId })
      .eq('operator_id', operatorId)
  } else {
    await admin.from('active_dispatch')
      .insert({ operator_id: operatorId, dispatch_status: 'not_dispatched', updated_by: userId })
  }

  return ok({ operatorId, scenario })
}))
