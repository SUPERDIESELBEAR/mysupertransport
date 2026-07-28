import { requireStaff, ok, fail, withErrorEnvelope } from '../_shared/email/index.ts'
import {
  isDemoScenario,
  onboardingStatusForScenario,
  applicationStatusForScenario,
  type DemoScenario,
} from '../_shared/demo-scenarios.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Creates a sandboxed demo driver account (auth user + application + operator +
// onboarding_status) flagged with is_demo so it stays out of live staff views
// and can never receive real outbound email.

Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  const { userId } = auth

  let body: any
  try { body = await req.json() } catch { return fail(400, 'Invalid JSON body') }

  const firstName = String(body?.firstName ?? '').trim()
  const lastName = String(body?.lastName ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const unitNumber = body?.unitNumber ? String(body.unitNumber).trim() : null
  const demoLabel = body?.demoLabel ? String(body.demoLabel).trim() : null
  const scenario: DemoScenario = isDemoScenario(body?.scenario) ? body.scenario : 'blank'

  if (!firstName || !lastName) return fail(400, 'firstName and lastName are required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'A valid email is required')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Auth user (reuse if the address already exists).
  let demoUserId: string | null = null
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users?.find((u: any) => (u.email ?? '').toLowerCase() === email)
  if (existing) {
    demoUserId = existing.id
  } else {
    const password = crypto.randomUUID() + crypto.randomUUID()
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, invited_as: 'operator', is_demo: true },
    })
    if (cErr || !created?.user) return fail(500, `Could not create demo user: ${cErr?.message ?? 'unknown error'}`)
    demoUserId = created.user.id
  }

  // 2. Profile + operator role.
  await admin.from('profiles').update({
    first_name: firstName,
    last_name: lastName,
    is_demo: true,
  }).eq('user_id', demoUserId!)

  await admin.from('user_roles').upsert(
    { user_id: demoUserId!, role: 'operator' },
    { onConflict: 'user_id,role' },
  )

  // 3. Application.
  const appStatus = applicationStatusForScenario(scenario)
  const { data: app, error: appErr } = await admin.from('applications').insert({
    email,
    first_name: firstName,
    last_name: lastName,
    user_id: demoUserId,
    is_demo: true,
    submitted_at: appStatus.is_draft ? null : new Date().toISOString(),
    reviewed_at: appStatus.review_status === 'approved' ? new Date().toISOString() : null,
    review_status: appStatus.review_status,
    is_draft: appStatus.is_draft,
  }).select('id').single()
  if (appErr || !app) return fail(500, `Could not create demo application: ${appErr?.message}`)

  // 4. Operator.
  const { data: op, error: opErr } = await admin.from('operators').insert({
    user_id: demoUserId,
    application_id: app.id,
    unit_number: unitNumber,
    is_active: scenario !== 'blank',
    is_demo: true,
    demo_label: demoLabel,
    demo_scenario: scenario,
    demo_owner_user_id: userId,
    assigned_onboarding_staff: userId,
  }).select('id').single()
  if (opErr || !op) return fail(500, `Could not create demo operator: ${opErr?.message}`)

  // 5. Onboarding status + dispatch row.
  const { error: obErr } = await admin.from('onboarding_status').insert({
    operator_id: op.id,
    unit_number: unitNumber,
    ...onboardingStatusForScenario(scenario),
  })
  if (obErr) return fail(500, `Could not create onboarding status: ${obErr.message}`)

  await admin.from('active_dispatch').insert({
    operator_id: op.id,
    dispatch_status: 'not_dispatched',
    updated_by: userId,
  })

  return ok({
    userId: demoUserId,
    applicationId: app.id,
    operatorId: op.id,
    scenario,
  })
}))
