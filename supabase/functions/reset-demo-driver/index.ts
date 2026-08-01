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
  'eld_malfunction_events',
]

// Records of duty status cannot be deleted directly -- a BEFORE DELETE lock
// trigger refuses, and their storage objects have to go through the Storage
// API. Route them through the purge-rods-day edge function, the only
// authoritative purge path.
//
// Ordering matters: an amendment must be purged before the original it
// supersedes. `supersedes_day_id IS NOT NULL` is one-level thinking -- in a
// chain original <- A1 <- A2 it is true for both amendments and the wrong
// order hits 23503. Purge only rows nothing references, then re-query.
async function purgeOperatorRodsDays(
  admin: any,
  authHeader: string,
  operatorId: string,
  reason: string,
) {
  const purged: string[] = []
  for (let pass = 0; pass < 50; pass++) {
    const { data: rows, error } = await admin
      .from('rods_days')
      .select('id, supersedes_day_id')
      .eq('operator_id', operatorId)
    if (error) throw new Error(`Could not read duty-status logs: ${error.message}`)
    const all = (rows ?? []) as Array<{ id: string; supersedes_day_id: string | null }>
    if (all.length === 0) return purged

    const superseded = new Set(all.map((r) => r.supersedes_day_id).filter(Boolean) as string[])
    const leaves = all.filter((r) => !superseded.has(r.id)).map((r) => r.id)
    if (leaves.length === 0) {
      // Every row is referenced by another: a cycle. Bail loudly.
      throw new Error(
        `Refusing to purge: duty-status amendment chain for operator ${operatorId} has no unreferenced row (cycle).`,
      )
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/purge-rods-day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ dayIds: leaves, reason }),
    })
    if (!res.ok) {
      throw new Error(`purge-rods-day failed (${res.status}): ${await res.text()}`)
    }
    purged.push(...leaves)
  }
  throw new Error('Refusing to purge: duty-status chain did not resolve within 50 passes.')
}
Deno.serve(withErrorEnvelope(async (req) => {
  const auth = await requireStaff(req, { roles: ['management', 'owner'] })
  if (auth instanceof Response) return auth
  const { userId } = auth
  const authHeader = req.headers.get('Authorization') ?? ''

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

  // 1b. Records of duty status, through the authoritative purge path.
  //
  // Everything a demo ELD session leaves behind, cleared BEFORE the purge so
  // no child row blocks a day from going. rods_unlock_events points at
  // rods_day_id; the alerts and their bell notifications are the two halves of
  // one fan-out and have to go together or the console keeps a link to a row
  // that no longer exists.
  const { data: demoAlerts } = await admin
    .from('eld_sync_alerts').select('id').eq('operator_id', operatorId)
  const alertIds = (demoAlerts ?? []).map((a: { id: string }) => a.id)
  if (alertIds.length > 0) {
    await admin.from('notifications').delete()
      .eq('entity_type', 'eld_sync_alert').in('entity_id', alertIds)
  }
  for (const table of ['eld_sync_alerts', 'rods_unlock_events']) {
    const { error } = await admin.from(table as any).delete().eq('operator_id', operatorId)
    if (error) console.error(`reset-demo-driver: failed clearing ${table}`, error.message)
  }
  if (operator.user_id) {
    await admin.from('notifications').delete().eq('user_id', operator.user_id)
  }

  // Public URLs. A demo operator should never have minted one — the share
  // token trigger refuses — but a token issued before the guardrail shipped is
  // still live infrastructure, so the reset revokes rather than assumes.
  const { data: packetLinks } = await admin
    .from('officer_packet_links').select('token').eq('operator_id', operatorId)
  const linkTokens = (packetLinks ?? []).map((l: { token: string }) => l.token)
  if (linkTokens.length > 0) {
    await admin.from('share_tokens').delete().in('token', linkTokens)
    await admin.from('officer_packet_links').delete().in('token', linkTokens)
  }

  let rodsPurged: string[] = []
  try {
    rodsPurged = await purgeOperatorRodsDays(
      admin,
      authHeader,
      operatorId,
      `Demo driver reset — synthetic records of duty status, scenario ${scenario}.`,
    )
  } catch (e) {
    return fail(500, `Could not purge demo duty-status logs: ${(e as Error).message}`)
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
    // Device-side signal: the roadside Dexie stores drop any cached day older
    // than this stamp, so a reset phone does not keep showing purged logs.
    demo_reset_at: new Date().toISOString(),
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

  return ok({ operatorId, scenario, rodsDaysPurged: rodsPurged.length })
}))
