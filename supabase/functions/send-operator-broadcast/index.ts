import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmailStrict, SUPPORT_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── AuthN/AuthZ ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: claims, error: claimsErr } = await supabaseAdmin.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['management', 'owner'])
      .limit(1);
    if (!roleRows?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Input ──────────────────────────────────────────────────────────────
    const body = await req.json();
    const subject: string = (body.subject ?? '').trim();
    const messageBody: string = (body.body ?? '').trim();
    const ctaLabel: string | undefined = body.ctaLabel?.trim() || undefined;
    const ctaUrl: string | undefined = body.ctaUrl?.trim() || undefined;
    const operatorIds: string[] | undefined = Array.isArray(body.operatorIds) && body.operatorIds.length
      ? body.operatorIds
      : undefined;

    if (!subject || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Subject required (max 200 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!messageBody || messageBody.length > 10000) {
      return new Response(JSON.stringify({ error: 'Body required (max 10000 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (ctaLabel && !ctaUrl) {
      return new Response(JSON.stringify({ error: 'CTA URL required when label is set' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve recipients ─────────────────────────────────────────────────
    let opQuery = supabaseAdmin
      .from('operators')
      .select('id, user_id')
      .eq('is_active', true);
    if (operatorIds) opQuery = opQuery.in('id', operatorIds);

    const { data: operators, error: opErr } = await opQuery;
    if (opErr) throw opErr;
    if (!operators?.length) {
      return new Response(JSON.stringify({ error: 'No active operators matched' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userIds = [...new Set(operators.map((o) => o.user_id))];

    // Opt-out check (event_type = 'broadcast')
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, email_enabled')
      .eq('event_type', 'broadcast')
      .in('user_id', userIds);
    const optedOut = new Set(
      (prefs ?? []).filter((p) => p.email_enabled === false).map((p) => p.user_id)
    );

    // Email lookup
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of usersData?.users ?? []) {
      if (u.email) emailMap.set(u.id, u.email);
    }

    // ── Archive header ─────────────────────────────────────────────────────
    const { data: broadcast, error: bErr } = await supabaseAdmin
      .from('operator_broadcasts')
      .insert({
        subject,
        body: messageBody,
        cta_label: ctaLabel ?? null,
        cta_url: ctaUrl ?? null,
        sent_by: userId,
        recipient_scope: operatorIds ? 'selected' : 'all',
        recipient_count: operators.length,
      })
      .select('id')
      .single();
    if (bErr) throw bErr;
    const broadcastId = broadcast.id;

    // Build email HTML once
    const safeBody = escapeHtml(messageBody).replace(/\n/g, '<br/>');
    const html = buildEmail(
      subject,
      escapeHtml(subject),
      `<div style="color:#444;font-size:15px;line-height:1.7;">${safeBody}</div>`,
      ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : undefined,
      SUPPORT_EMAIL
    );

    const resendKey = Deno.env.get('RESEND_API_KEY');
    let delivered = 0, failed = 0, skipped = 0;

    // Pre-stage recipient rows
    const recipientRows = operators.map((op) => {
      const email = emailMap.get(op.user_id);
      let status: string;
      if (!email) status = 'skipped_no_email';
      else if (optedOut.has(op.user_id)) status = 'skipped_optout';
      else status = 'pending';
      return { broadcast_id: broadcastId, operator_id: op.id, email: email ?? '', status };
    });
    await supabaseAdmin.from('operator_broadcast_recipients').insert(recipientRows);

    if (!resendKey) {
      console.warn('RESEND_API_KEY not set — broadcast archived but not sent');
      await supabaseAdmin.from('operator_broadcasts').update({
        completed_at: new Date().toISOString(),
        skipped_count: operators.length,
      }).eq('id', broadcastId);
      return new Response(JSON.stringify({ broadcastId, sent: 0, failed: 0, skipped: operators.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send loop with rate limit
    for (const op of operators) {
      const email = emailMap.get(op.user_id);
      if (!email) { skipped++; continue; }
      if (optedOut.has(op.user_id)) { skipped++; continue; }
      try {
        await sendEmailStrict(email, subject, html, resendKey);
        delivered++;
        await supabaseAdmin.from('operator_broadcast_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('broadcast_id', broadcastId).eq('operator_id', op.id);
      } catch (e) {
        failed++;
        await supabaseAdmin.from('operator_broadcast_recipients')
          .update({ status: 'failed', error: String(e).slice(0, 500) })
          .eq('broadcast_id', broadcastId).eq('operator_id', op.id);
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    await supabaseAdmin.from('operator_broadcasts').update({
      completed_at: new Date().toISOString(),
      delivered_count: delivered,
      failed_count: failed,
      skipped_count: skipped,
    }).eq('id', broadcastId);

    return new Response(JSON.stringify({ broadcastId, sent: delivered, failed, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-operator-broadcast error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});