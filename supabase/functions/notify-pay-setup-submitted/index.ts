import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, ONBOARDING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload = await req.json();
    const { operator_id, contractor_pay_setup_id } = payload as {
      operator_id: string;
      contractor_pay_setup_id?: string;
    };

    if (!operator_id) {
      return new Response(JSON.stringify({ error: 'operator_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load contractor pay setup record ──────────────────────────────────
    let setupQuery = supabaseAdmin
      .from('contractor_pay_setup')
      .select('id, operator_id, contractor_type, business_name, legal_first_name, legal_last_name, email, phone, submitted_at')
      .eq('operator_id', operator_id)
      .order('submitted_at', { ascending: false })
      .limit(1);

    if (contractor_pay_setup_id) {
      setupQuery = supabaseAdmin
        .from('contractor_pay_setup')
        .select('id, operator_id, contractor_type, business_name, legal_first_name, legal_last_name, email, phone, submitted_at')
        .eq('id', contractor_pay_setup_id)
        .limit(1);
    }

    const { data: setupRows } = await setupQuery;
    const setup = setupRows?.[0];
    if (!setup) {
      return new Response(JSON.stringify({ error: 'contractor_pay_setup not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve driver name from application ──────────────────────────────
    const { data: opRow } = await supabaseAdmin
      .from('operators')
      .select('id, application_id')
      .eq('id', operator_id)
      .maybeSingle();

    let driverName = `${setup.legal_first_name ?? ''} ${setup.legal_last_name ?? ''}`.trim() || 'A driver';
    if (opRow?.application_id) {
      const { data: appRow } = await supabaseAdmin
        .from('applications')
        .select('first_name, last_name')
        .eq('id', opRow.application_id)
        .maybeSingle();
      if (appRow) {
        const full = `${appRow.first_name ?? ''} ${appRow.last_name ?? ''}`.trim();
        if (full) driverName = full;
      }
    }

    const isBusiness = setup.contractor_type === 'business';
    const contractorLabel = isBusiness
      ? `Business${setup.business_name ? ` (${setup.business_name})` : ''}`
      : 'Individual';

    // ── Recipient list: owner + management with email_enabled ─────────────
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['owner', 'management']);

    const candidateUserIds = Array.from(new Set((roleRows ?? []).map(r => r.user_id)));
    if (!candidateUserIds.length) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no owner/management users' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull preferences for these users
    const { data: prefRows } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, email_enabled')
      .eq('event_type', 'pay_setup_submitted')
      .in('user_id', candidateUserIds);

    const prefMap = new Map<string, boolean>();
    (prefRows ?? []).forEach(p => prefMap.set(p.user_id, p.email_enabled));

    // Owner role = default ON, others = default OFF
    const ownerIds = new Set(
      (roleRows ?? []).filter(r => r.role === 'owner').map(r => r.user_id)
    );

    const eligibleUserIds = candidateUserIds.filter(uid => {
      if (prefMap.has(uid)) return prefMap.get(uid) === true;
      return ownerIds.has(uid); // default
    });

    if (!eligibleUserIds.length) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no recipients with email enabled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve email addresses via auth.admin
    const recipientEmails: string[] = [];
    for (const uid of eligibleUserIds) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (user?.email) recipientEmails.push(user.email);
    }

    if (!recipientEmails.length) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no email addresses found' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const operatorLink = `${appUrl}/management?operator=${operator_id}`;
    const submittedDisplay = setup.submitted_at
      ? new Date(setup.submitted_at).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          dateStyle: 'medium',
          timeStyle: 'short',
        }) + ' CT'
      : 'Just now';

    const subject = `💰 Pay Setup Submitted — ${driverName}`;
    const heading = `💰 Pay Setup Ready — ${driverName}`;
    const body = `
      <p><strong>${driverName}</strong> just completed Stage 8 (Contractor Pay Setup) and is ready for the payroll setup link.</p>

      <table cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;color:#888;font-size:13px;width:140px;">Driver</td>
            <td style="padding:8px 0;color:#222;font-size:14px;font-weight:600;">${driverName}</td></tr>
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Contractor Type</td>
            <td style="padding:8px 0;color:#222;font-size:14px;font-weight:600;">${contractorLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Legal Name</td>
            <td style="padding:8px 0;color:#222;font-size:14px;">${setup.legal_first_name ?? ''} ${setup.legal_last_name ?? ''}</td></tr>
        ${isBusiness && setup.business_name ? `
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Business</td>
            <td style="padding:8px 0;color:#222;font-size:14px;">${setup.business_name}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Phone</td>
            <td style="padding:8px 0;color:#222;font-size:14px;">${setup.phone ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Email</td>
            <td style="padding:8px 0;color:#222;font-size:14px;">${setup.email ?? '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#888;font-size:13px;">Submitted</td>
            <td style="padding:8px 0;color:#222;font-size:14px;">${submittedDisplay}</td></tr>
      </table>

      <p style="margin-top:18px;">Open their detail panel to review the full pay setup and send the Everee payroll link.</p>
    `;

    const html = buildEmail(
      subject,
      heading,
      body,
      { label: 'View Driver →', url: operatorLink },
      ONBOARDING_EMAIL
    );

    // Send to each recipient
    for (const to of recipientEmails) {
      try {
        await sendEmail(to, subject, html, RESEND_API_KEY);
        console.log(`[notify-pay-setup-submitted] Sent to ${to}`);
      } catch (e) {
        console.warn(`[notify-pay-setup-submitted] Failed to send to ${to}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-pay-setup-submitted] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});