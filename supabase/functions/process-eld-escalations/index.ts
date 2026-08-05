/**
 * §2 ELD malfunction escalation ladder.
 *
 * Runs daily. For every OPEN, non-demo malfunction event it decides what is due
 * today (see `_shared/eld/escalationLadder.ts` for the two-clock rules), writes
 * a ledger row in `eld_malfunction_notifications`, and only then delivers.
 *
 * The ledger is the dedupe: the unique constraint is
 *   (event_id, recipient_user_id, notification_type, day_number, channel, sent_on)
 * with NULLS NOT DISTINCT, which is what stops `ack_overdue` (day_number NULL)
 * re-firing within a day. Inserts use ignoreDuplicates, so a re-run of the job
 * on the same day is a no-op and delivers nothing twice.
 */
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';
import { ok, fail, withErrorEnvelope, sendResendDirect, buildAppUrl } from '../_shared/email/index.ts';
import {
  evaluateEvent,
  driverQuietHoursOk,
  type EscalationKind,
  type LadderAction,
  type LadderEvent,
} from '../_shared/eld/escalationLadder.ts';
import { reminderText, type StaleModel } from '../_shared/eld/revokedListReminder.ts';

const DEFAULT_TZ = 'America/Chicago';

const NOTIF_TYPE: Record<EscalationKind, string> = {
  escalation_day: 'eld_escalation_day',
  ack_overdue: 'eld_ack_overdue',
  extension_prompt: 'eld_extension_prompt',
  pause_lapsed: 'eld_escalation_pause_lapsed',
};

const TITLES: Record<EscalationKind, string> = {
  escalation_day: 'ELD repair window',
  ack_overdue: 'ELD malfunction not acknowledged',
  extension_prompt: 'ELD extension window closing',
  pause_lapsed: 'ELD escalation pause ended',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Service-role bearer (cron) or a signed-in staff user (manual/dry run). */
async function authorize(
  req: Request,
): Promise<{ authHeader: string; isService: boolean; actorId: string | null } | Response> {
  // pg_cron cannot mint a JWT, so the scheduled run authenticates with a shared
  // internal token. It is never accepted from a browser (no CORS exposure of
  // this header) and grants exactly the same access as the service-role path.
  const cronSecret = Deno.env.get('ELD_CRON_SECRET');
  const presented = req.headers.get('x-eld-cron-secret');
  if (cronSecret && presented && presented === cronSecret) {
    return {
      authHeader: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      isService: true,
      actorId: null,
    };
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'Unauthorized: missing bearer token');
  const token = authHeader.slice('Bearer '.length);
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { authHeader, isService: true, actorId: null };
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getClaims(token);
  const uid = data?.claims?.sub as string | undefined;
  if (error || !uid) return fail(401, 'Unauthorized: invalid or expired token');

  const admin = serviceClient();
  const { data: role } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .in('role', ['management', 'onboarding_staff', 'owner'])
    .limit(1);
  if (!role || role.length === 0) return fail(403, 'Staff access required');
  return { authHeader, isService: false, actorId: uid };
}

interface Recipient { userId: string; email: string | null }

async function loadStaffRecipients(admin: SupabaseClient): Promise<Recipient[]> {
  // In-app notifications still go to all staff; email is gated by the managed
  // Email Notification Settings (Compliance category).
  const { data: roles } = await admin
    .from('user_roles')
    .select('user_id')
    .in('role', ['management', 'onboarding_staff', 'owner']);
  const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id as string)));
  if (ids.length === 0) return [];

  const emailRecipients = await resolveEmailRecipients(admin, 'compliance');
  const emailById = new Map(emailRecipients.map((r) => [r.user_id, r.email]));

  return ids.map((id) => ({ userId: id, email: emailById.get(id) ?? null }));
}

function emailHtml(v: {
  heading: string;
  driverName: string;
  unitNumber: string | null;
  day: number;
  deadline: string;
  discoveredLocal: string;
  reportedLocal: string;
  reason: string;
  skippedRungs?: number[];
  extensionDeadlineLocal?: string;
  link: string;
}): string {
  const row = (k: string, val: string) =>
    `<tr><td style="padding:8px 12px;background:#faf9f6;font-weight:600;width:42%;">${escapeHtml(k)}</td>
      <td style="padding:8px 12px;">${escapeHtml(val)}</td></tr>`;

  const skipped = v.skippedRungs?.length
    ? `<p style="margin:16px 0 0;padding:10px 14px;background:#fdf6e6;border-left:4px solid #C9A84C;border-radius:4px;font-size:13px;color:#5a4a1e;">
         Reported on day ${v.day} of 8 — day${v.skippedRungs.length > 1 ? 's' : ''}
         ${v.skippedRungs.join(', ')} elapsed before the driver reported it, so those
         reminders were not sent.
       </p>`
    : '';

  const ext = v.extensionDeadlineLocal
    ? row('Extension must be filed by', v.extensionDeadlineLocal)
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(v.heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        ${emailHeader('ELD MALFUNCTION')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">${escapeHtml(v.heading)}</h1>
          <p style="margin:0 0 20px;color:#666;font-size:14px;">${escapeHtml(v.reason)}</p>
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px;">
            ${row('Driver', v.driverName)}
            ${row('Unit', v.unitNumber || '—')}
            ${row('Discovered', v.discoveredLocal)}
            ${row('Reported by driver', v.reportedLocal)}
            ${row('Repair window', `Day ${v.day} of 8`)}
            ${row('Repair deadline', v.deadline)}
            ${ext}
          </table>
          ${skipped}
          <p style="margin:24px 0 0;">
            <a href="${v.link}" style="display:inline-block;background:#C9A84C;color:#0D0D0D;
              text-decoration:none;font-weight:700;padding:12px 24px;border-radius:6px;font-size:14px;">
              Open the malfunction</a>
          </p>
        </td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null) as
    | { dryRun?: boolean; nowOverride?: string; eventId?: string; channels?: 'all' | 'in_app' }
    | null;
  const dryRun = body?.dryRun === true;
  // Verification runs walk the ladder for real (ledger + in-app rows, so the
  // Action tab can be asserted on) without putting a synthetic driver in a real
  // inbox. Service-role only.
  const inAppOnly = body?.channels === 'in_app';
  // A row produced by a time-travelled or channel-overridden run must never be
  // able to pass as proof the office was notified on time. is_override is
  // immutable after insert (BEFORE UPDATE trigger), and the console's
  // timeliness column reads only is_override = false rows.
  const isOverride = Boolean(body?.nowOverride) || inAppOnly;
  // Time travel lets a verification run walk an event through the ladder
  // without waiting eight days. The endpoint is already service-role or staff
  // only, and the ledger records the effective date, so an override run is
  // visible in the ledger rather than hidden.
  const now = body?.nowOverride ? new Date(body.nowOverride) : new Date();
  if (Number.isNaN(now.getTime())) return fail(400, 'nowOverride is not a valid timestamp');

  const admin = serviceClient();

  // Run ledger: pg_cron's job_run_details does not carry the function's
  // response body, and edge logs retain ~10 minutes. A quiet run (zero events,
  // zero rows, zero emails) must still be legible from the database months
  // later, and distinguishable from a job that never fired at all.
  const startedAt = Date.now();
  let runId: string | null = null;
  if (!dryRun) {
    const { data: runRow } = await admin
      .from('eld_cron_runs')
      .insert({
        job_name: 'process-eld-escalations',
        trigger_source: auth.isService ? 'cron' : 'manual',
        is_override: isOverride,
        effective_date: now.toISOString().slice(0, 10),
        status: 'running',
      })
      .select('id')
      .maybeSingle();
    runId = runRow?.id ?? null;
  }
  const finishRun = async (
    status: 'ok' | 'error',
    payload: Record<string, unknown>,
    errorText?: string,
  ) => {
    if (!runId) return;
    await admin.from('eld_cron_runs').update({
      status,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      events_evaluated: Number(payload.events ?? 0),
      ledger_rows_inserted: Number(payload.ledger_rows_inserted ?? 0),
      emails_sent: Number(payload.emails_sent ?? 0),
      error_text: errorText ?? null,
      result: payload,
    }).eq('id', runId);
  };

  try {

  const { data: carrier } = await admin
    .from('carrier_profile')
    .select('home_terminal_timezone')
    .limit(1)
    .maybeSingle();
  const timeZone = carrier?.home_terminal_timezone || DEFAULT_TZ;

  // Demo operators are filtered out of the query itself: no ledger row, no
  // notification, no email — nothing downstream can leak them back in.
  let query = admin
    .from('eld_malfunction_events')
    .select(`id, operator_id, discovered_at, created_at, status, repair_deadline,
      carrier_acknowledged_at, extension_granted_at, extension_expires_on,
      escalations_suppressed_until,
      escalations_suppressed_reason, malfunction_code, is_demo,
      operators!inner(id, unit_number, user_id, is_demo)`)
    .eq('status', 'open')
    .eq('is_demo', false);
  if (body?.eventId) query = query.eq('id', body.eventId);

  const { data: events, error: eventsError } = await query;
  if (eventsError) {
    await finishRun('error', { events: 0 }, eventsError.message);
    return fail(500, 'Could not load malfunction events', eventsError.message);
  }

  // operators has no FK to profiles (user_id points at auth.users), so the
  // driver's name is a second read rather than an embed.
  const driverUserIds = Array.from(new Set(
    // deno-lint-ignore no-explicit-any
    (events ?? []).map((e: any) => e.operators?.user_id).filter(Boolean),
  )) as string[];
  const nameByUserId = new Map<string, string>();
  if (driverUserIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', driverUserIds);
    for (const p of profileRows ?? []) {
      nameByUserId.set(
        p.user_id as string,
        [p.first_name, p.last_name].filter(Boolean).join(' '),
      );
    }
  }

  const recipients = await loadStaffRecipients(admin);
  const sentOn = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  const results: Array<Record<string, unknown>> = [];
  let inserted = 0;
  let emailed = 0;

  for (const ev of (events ?? [])) {
    // deno-lint-ignore no-explicit-any
    const e = ev as any;
    if (e.operators?.is_demo === true) continue;

    const ladderEvent: LadderEvent = {
      id: e.id,
      discovered_at: e.discovered_at,
      created_at: e.created_at,
      status: e.status,
      carrier_acknowledged_at: e.carrier_acknowledged_at,
      extension_granted_at: e.extension_granted_at,
      extension_expires_on: e.extension_expires_on,
      escalations_suppressed_until: e.escalations_suppressed_until,
      escalations_suppressed_reason: e.escalations_suppressed_reason,
    };
    const { day, actions } = evaluateEvent(ladderEvent, now, timeZone);
    if (actions.length === 0) {
      results.push({ event_id: e.id, day, actions: [] });
      continue;
    }

    const driverName = nameByUserId.get(e.operators?.user_id) || 'Driver';
    const unitNumber: string | null = e.operators?.unit_number ?? null;
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
    const deadline = new Date(`${e.repair_deadline}T12:00:00`)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const extensionDeadline = new Date(new Date(e.created_at).getTime() + 5 * 86400000)
      .toLocaleDateString('en-US', { timeZone, month: 'long', day: 'numeric', year: 'numeric' });
    // The portal reads `?view=`; `?tab=` silently falls through to Overview,
    // so an escalation notice would never land on the event it is about.
    const link = buildAppUrl(`/management?view=eld-malfunctions&event=${e.id}`);

    // The extension prompt is offered ONCE per event, not once per day: the
    // per-day ledger key would otherwise repeat it every day the window is
    // open. Dedupe on the event, across all dates.
    let due = actions;
    if (actions.some((a) => a.kind === 'extension_prompt')) {
      const { data: priorPrompt } = await admin
        .from('eld_malfunction_notifications')
        .select('id')
        .eq('event_id', e.id)
        .eq('notification_type', 'extension_prompt')
        .limit(1);
      if (priorPrompt && priorPrompt.length > 0) {
        due = actions.filter((a) => a.kind !== 'extension_prompt');
      }
    }
    if (due.length === 0) {
      results.push({ event_id: e.id, day, actions: [] });
      continue;
    }

    for (const action of due) {
      const type = NOTIF_TYPE[action.kind];
      const fired = await deliver({
        admin, dryRun, action, type, e, day, driverName, unitNumber, deadline,
        discoveredLocal: fmt(e.discovered_at), reportedLocal: fmt(e.created_at),
        extensionDeadline, link, recipients, sentOn, timeZone, now, inAppOnly,
        authHeader: auth.authHeader, isOverride,
      });
      inserted += fired.inserted;
      emailed += fired.emailed;
      results.push({
        event_id: e.id, day, kind: action.kind, reason: action.reason,
        skippedRungs: action.skippedRungs ?? null, ...fired,
      });
    }
  }

  // An override run is tellable apart from a real run at a glance, without
  // reading the ledger.
  const revokedListReminders = await sendRevokedListReminders(admin, recipients, now, dryRun);

  if (isOverride && !dryRun) {
    await admin.from('audit_log').insert({
      action: 'eld_escalation_override_run',
      entity_type: 'eld_malfunction_event',
      entity_id: body?.eventId ?? null,
      actor_id: auth.actorId ?? null,
      actor_name: auth.isService ? 'service_role (cron/verification)' : null,
      entity_label: 'ELD escalation override run',
      metadata: {
        now_override: body?.nowOverride ?? null,
        channels: body?.channels ?? 'all',
        event_filter: body?.eventId ?? null,
        events_evaluated: events?.length ?? 0,
        ledger_rows_inserted: inserted,
        emails_sent: emailed,
      },
    });
  }

  const payload = {
    success: true,
    dryRun,
    isOverride,
    evaluated_at: now.toISOString(),
    timezone: timeZone,
    events: events?.length ?? 0,
    ledger_rows_inserted: inserted,
    emails_sent: emailed,
    revoked_list_reminders: revokedListReminders,
    results,
  };
  await finishRun('ok', payload);
  return ok(payload);

  } catch (err) {
    await finishRun('error', { events: 0 }, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

interface DeliverArgs {
  admin: SupabaseClient;
  dryRun: boolean;
  action: LadderAction;
  type: string;
  // deno-lint-ignore no-explicit-any
  e: any;
  day: number;
  driverName: string;
  unitNumber: string | null;
  deadline: string;
  discoveredLocal: string;
  reportedLocal: string;
  extensionDeadline: string;
  link: string;
  recipients: Recipient[];
  sentOn: string;
  timeZone: string;
  now: Date;
  inAppOnly: boolean;
  authHeader: string;
  isOverride: boolean;
}

async function deliver(a: DeliverArgs): Promise<{ inserted: number; emailed: number; recipients: string[] }> {
  const heading = `${TITLES[a.action.kind]} — ${a.driverName}${a.unitNumber ? ` (Unit ${a.unitNumber})` : ''}`;
  const html = emailHtml({
    heading,
    driverName: a.driverName,
    unitNumber: a.unitNumber,
    day: a.day,
    deadline: a.deadline,
    discoveredLocal: a.discoveredLocal,
    reportedLocal: a.reportedLocal,
    reason: a.action.reason,
    skippedRungs: a.action.skippedRungs,
    extensionDeadlineLocal: a.action.kind === 'extension_prompt' ? a.extensionDeadline : undefined,
    link: a.link,
  });

  if (a.dryRun) {
    return { inserted: 0, emailed: 0, recipients: a.recipients.map((r) => r.userId) };
  }

  const firedFor: string[] = [];
  let emailed = 0;

  for (const r of a.recipients) {
    // Ledger first. If the row already exists for this recipient/type/day/date
    // the upsert returns nothing and we deliver nothing — that is the whole
    // re-fire guard, and for ack_overdue (day_number NULL) it rests on
    // NULLS NOT DISTINCT.
    const { data: ledger, error: ledgerError } = await a.admin
      .from('eld_malfunction_notifications')
      .upsert({
        event_id: a.e.id,
        notification_type: a.action.kind,
        day_number: a.action.dayNumber,
        recipient_user_id: r.userId,
        channel: 'in_app',
        sent_on: a.sentOn,
        is_override: a.isOverride,
      }, {
        onConflict: 'event_id,recipient_user_id,notification_type,day_number,channel,sent_on',
        ignoreDuplicates: true,
      })
      .select('id');
    if (ledgerError) {
      console.error('escalation ledger insert failed', a.e.id, a.action.kind, ledgerError.message);
      continue;
    }
    if (!ledger || ledger.length === 0) continue;

    firedFor.push(r.userId);

    await a.admin.from('notifications').insert({
      user_id: r.userId,
      type: a.type,
      title: heading,
      body: a.action.reason,
      link: `/management?view=eld-malfunctions&event=${a.e.id}`,
      priority: 'action',
      entity_type: 'eld_malfunction_event',
      entity_id: a.e.id,
    });

    if (r.email && !a.inAppOnly) {
      const { data: emailLedger } = await a.admin
        .from('eld_malfunction_notifications')
        .upsert({
          event_id: a.e.id,
          notification_type: a.action.kind,
          day_number: a.action.dayNumber,
          recipient_user_id: r.userId,
          channel: 'email',
          sent_on: a.sentOn,
          is_override: a.isOverride,
        }, {
          onConflict: 'event_id,recipient_user_id,notification_type,day_number,channel,sent_on',
          ignoreDuplicates: true,
        })
        .select('id');
      if (emailLedger && emailLedger.length > 0) {
        const res = await sendResendDirect({
          supabase: a.admin,
          role: 'onboarding',
          to: [r.email],
          subject: heading,
          html,
          logLabel: `eld_${a.action.kind}`,
          skipSuppression: true,
          authHeader: a.authHeader,
        });
        if (res.success) emailed += 1;
      }
    }
  }

  // The driver gets the rung in-app only, and only inside local waking hours.
  const driverUserId = a.e.operators?.user_id as string | undefined;
  if (driverUserId && a.action.kind === 'escalation_day' && driverQuietHoursOk(a.now, a.timeZone)) {
    const { data: driverLedger } = await a.admin
      .from('eld_malfunction_notifications')
      .upsert({
        event_id: a.e.id,
        notification_type: a.action.kind,
        day_number: a.action.dayNumber,
        recipient_user_id: driverUserId,
        channel: 'in_app',
        sent_on: a.sentOn,
        is_override: a.isOverride,
      }, {
        onConflict: 'event_id,recipient_user_id,notification_type,day_number,channel,sent_on',
        ignoreDuplicates: true,
      })
      .select('id');
    if (driverLedger && driverLedger.length > 0) {
      firedFor.push(driverUserId);
      await a.admin.from('notifications').insert({
        user_id: driverUserId,
        type: a.type,
        title: `ELD repair — day ${a.day} of 8`,
        body: `Your ELD malfunction must be repaired or replaced by ${a.deadline}.`,
        link: '/portal?view=eld',
        priority: 'action',
        entity_type: 'eld_malfunction_event',
        entity_id: a.e.id,
      });
    }
  }

  return { inserted: firedFor.length, emailed, recipients: firedFor };
}

Deno.serve(withErrorEnvelope(handler));

/**
 * §7 quarterly revoked-list reminder. Folded into this job rather than a
 * second scheduled function so there is one cron, one run ledger, and one
 * place where a missed run is visible.
 *
 * Dedupe is a 90-day lookback on the notification itself, so a daily cron
 * produces one reminder per model per quarter. The frequency cannot escalate;
 * the text does (see revokedListReminder.ts).
 */
async function sendRevokedListReminders(
  admin: SupabaseClient,
  recipients: Recipient[],
  now: Date,
  dryRun: boolean,
): Promise<{ models_due: number; notifications_inserted: number; skipped_deduped: number }> {
  const staleBefore = new Date(now.getTime() - 90 * 86400000).toISOString();

  const { data: models, error } = await admin
    .from('eld_device_models')
    .select('id, provider_name, device_make, device_model, last_check_at, created_at')
    .eq('is_active', true)
    .or(`last_check_at.is.null,last_check_at.lt.${staleBefore}`);
  if (error) {
    console.error('revoked-list reminder query failed', error.message);
    return { models_due: 0, notifications_inserted: 0, skipped_deduped: 0 };
  }

  let insertedCount = 0;
  let deduped = 0;

  for (const row of (models ?? []) as unknown as StaleModel[]) {
    // One reminder per model per 90 days, regardless of recipient count.
    const { data: prior } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'eld_revoked_list_due')
      .eq('entity_type', 'eld_device_model')
      .eq('entity_id', row.id)
      .gte('sent_at', staleBefore)
      .limit(1);
    if (prior && prior.length > 0) { deduped += 1; continue; }

    // Demo operators are excluded: a sandbox driver is not exposure.
    const { count } = await admin
      .from('eld_devices')
      .select('id, operators!inner(is_demo)', { count: 'exact', head: true })
      .eq('eld_device_model_id', row.id)
      .eq('is_active', true)
      .eq('operators.is_demo', false);
    const trucks = count ?? 0;

    const { title, body } = reminderText(row, trucks, now);
    if (dryRun) { insertedCount += 1; continue; }

    for (const r of recipients) {
      // Priority stays 'action': a stale check is a task. The revocation
      // notification is the incident, and inflating this one would erode it.
      await admin.from('notifications').insert({
        user_id: r.userId,
        type: 'eld_revoked_list_due',
        title,
        body,
        link: `/management?view=eld-device-models&model=${row.id}`,
        priority: 'action',
        entity_type: 'eld_device_model',
        entity_id: row.id,
      });
      insertedCount += 1;
    }
  }

  return {
    models_due: (models ?? []).length,
    notifications_inserted: insertedCount,
    skipped_deduped: deduped,
  };
}
