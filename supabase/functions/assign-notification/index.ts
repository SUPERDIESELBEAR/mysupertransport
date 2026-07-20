import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STAFF_ROLES = new Set(['onboarding_staff', 'dispatcher', 'management', 'owner']);

type Action = 'assign' | 'reassign' | 'decline' | 'ack';

interface Payload {
  action: Action;
  notificationIds: string[];
  assigneeUserId?: string | null;
  note?: string | null;
  sendPopup?: boolean;
  reason?: string | null;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });
    const token = authHeader.replace('Bearer ', '');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: claimsData, error: claimsError } = await admin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json(401, { error: 'Unauthorized' });
    const callerId = claimsData.claims.sub as string;

    const { data: callerRoles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .limit(10);
    const hasStaff = (callerRoles ?? []).some((r: { role: string }) => STAFF_ROLES.has(r.role));
    if (!hasStaff) return json(403, { error: 'Forbidden' });

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const { action, notificationIds, assigneeUserId, note, sendPopup = true, reason } = payload;

    if (!action || !['assign', 'reassign', 'decline', 'ack'].includes(action)) {
      return json(400, { error: 'action must be assign | reassign | decline | ack' });
    }
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return json(400, { error: 'notificationIds required' });
    }
    if ((action === 'assign' || action === 'reassign') && !assigneeUserId) {
      return json(400, { error: 'assigneeUserId required for assign/reassign' });
    }

    // Look up caller name for message copy.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerId)
      .maybeSingle();
    const callerName = [callerProfile?.first_name, callerProfile?.last_name].filter(Boolean).join(' ').trim() || 'A staff member';

    // Fetch the source notifications (need title/link + previous assignee for ack).
    const { data: sources, error: srcErr } = await admin
      .from('notifications')
      .select('id, title, link, entity_type, entity_id, assigned_to, user_id')
      .in('id', notificationIds);
    if (srcErr || !sources || sources.length === 0) return json(404, { error: 'Notifications not found' });

    // Owner (Marcus) — audit recipient.
    const { data: ownerRow } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    const ownerId = ownerRow?.user_id as string | null | undefined;

    const firstTitle = sources[0].title as string;
    const firstLink = sources[0].link as string | null;
    const firstEntityType = sources[0].entity_type as string | null;
    const firstEntityId = sources[0].entity_id as string | null;
    const pluralSuffix = sources.length > 1 ? `s (${sources.length})` : '';

    let assigneeName = '';
    if (assigneeUserId) {
      const { data: aProf } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', assigneeUserId)
        .maybeSingle();
      assigneeName = [aProf?.first_name, aProf?.last_name].filter(Boolean).join(' ').trim() || 'a teammate';
    }

    // -------- Perform primary DB action --------
    if (action === 'assign' || action === 'reassign') {
      const { error: upErr } = await admin
        .from('notifications')
        .update({ assigned_to: assigneeUserId })
        .in('id', notificationIds);
      if (upErr) return json(500, { error: upErr.message });
    } else if (action === 'decline') {
      const { error: upErr } = await admin
        .from('notifications')
        .update({ assigned_to: null })
        .in('id', notificationIds);
      if (upErr) return json(500, { error: upErr.message });
    }
    // 'ack' does not change assigned_to; it just fires the ack notification below.

    // -------- Notify assignee (only for assign/reassign) --------
    if ((action === 'assign' || action === 'reassign') && assigneeUserId && sendPopup) {
      await admin.from('notifications').insert({
        user_id: assigneeUserId,
        type: 'assignment',
        title: `${callerName} assigned you a notification${pluralSuffix}`,
        body: (note && note.trim()) || firstTitle,
        link: firstLink,
        entity_type: 'notification',
        entity_id: sources[0].id,
        priority: 'action',
        channel: 'in_app',
      });
    }

    // -------- Notify assigner (ack) --------
    if (action === 'ack' || action === 'decline' || action === 'reassign') {
      // Ack goes back to the prior assigner. For 'ack' / 'decline' the prior
      // assigner is whoever last had `assigned_to` set on the source row (the
      // caller for these actions is the current assignee). For 'reassign' the
      // caller may or may not be the current assignee — still send ack to the
      // prior assigner if different from caller.
      const priorAssigner = sources[0].assigned_to as string | null;
      if (priorAssigner && priorAssigner !== callerId) {
        let title = '';
        let body: string | null = firstTitle;
        if (action === 'ack') {
          title = `${callerName} received your assignment${pluralSuffix}`;
        } else if (action === 'decline') {
          title = `${callerName} declined your assignment${pluralSuffix}`;
          body = (reason && reason.trim()) || firstTitle;
        } else if (action === 'reassign') {
          title = `${callerName} re-assigned your item to ${assigneeName}`;
          body = (note && note.trim()) || firstTitle;
        }
        await admin.from('notifications').insert({
          user_id: priorAssigner,
          type: 'assignment_ack',
          title,
          body,
          link: firstLink,
          entity_type: firstEntityType,
          entity_id: firstEntityId,
          priority: 'fyi',
          channel: 'in_app',
        });
      }
    }

    // -------- Owner audit --------
    if (ownerId && ownerId !== callerId) {
      let auditTitle = '';
      let auditBody: string | null = firstTitle;
      if (action === 'assign') auditTitle = `${callerName} assigned notification${pluralSuffix} → ${assigneeName}`;
      else if (action === 'reassign') auditTitle = `${callerName} re-assigned notification${pluralSuffix} → ${assigneeName}`;
      else if (action === 'decline') {
        auditTitle = `${callerName} declined an assignment${pluralSuffix}`;
        auditBody = (reason && reason.trim()) || firstTitle;
      } else if (action === 'ack') auditTitle = `${callerName} accepted an assignment${pluralSuffix}`;
      if (note && note.trim() && (action === 'assign' || action === 'reassign')) {
        auditBody = `Note: ${note.trim()}\n\n${firstTitle}`;
      }
      await admin.from('notifications').insert({
        user_id: ownerId,
        type: 'assignment_audit',
        title: auditTitle,
        body: auditBody,
        link: firstLink,
        entity_type: firstEntityType,
        entity_id: firstEntityId,
        priority: 'fyi',
        channel: 'in_app',
      });
    }

    return json(200, { ok: true, count: sources.length });
  } catch (err) {
    console.error('assign-notification error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return json(500, { error: message });
  }
});