import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Email HTML builder ───────────────────────────────────────────────────────
function buildEmail(subject: string, heading: string, body: string, cta?: { label: string; url: string }): string {
  const ctaHtml = cta
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${cta.url}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          ${cta.label}
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0f1117;padding:24px 40px;border-bottom:3px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">DRIVER OPERATIONS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            ${ctaHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply directly to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string, resendKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'SUPERTRANSPORT <onboarding@mysupertransport.com>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`Resend warning [${res.status}] to ${to}: ${err}`);
  }
}

// ─── Milestone email templates ────────────────────────────────────────────────
const MILESTONE_COPY: Record<string, {
  subject: string;
  heading: string;
  body: (name: string) => string;
  cta: (appUrl: string) => { label: string; url: string };
}> = {
  background_check_cleared: {
    subject: 'Background Check Approved — SUPERTRANSPORT',
    heading: '✅ Background Check Cleared',
    body: (name) => `<p>Hi ${name},</p>
      <p>Great news — your <strong>MVR and Clearinghouse background checks</strong> have been reviewed and <strong>approved</strong> by our team.</p>
      <p>You're cleared to continue the onboarding process. Your coordinator will be reaching out shortly with next steps.</p>
      <p>Log in to your portal anytime to check your current onboarding progress.</p>`,
    cta: (appUrl) => ({ label: 'View My Onboarding Status', url: `${appUrl}/dashboard` }),
  },
  background_check_flagged: {
    subject: 'Background Check — Action Required | SUPERTRANSPORT',
    heading: '⚠️ Background Check — Action Required',
    body: (name) => `<p>Hi ${name},</p>
      <p>Our team has reviewed your MVR and Clearinghouse results and found an item that requires follow-up.</p>
      <p>Your onboarding coordinator will reach out to you directly with details and next steps.</p>
      <p>If you have questions in the meantime, please contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`,
    cta: (appUrl) => ({ label: 'Log In to Your Portal', url: `${appUrl}/dashboard` }),
  },
  ica_ready_to_sign: {
    subject: 'Action Required: Your ICA Agreement is Ready to Sign',
    heading: '📝 Your ICA Agreement is Ready',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>Independent Contractor Agreement (ICA)</strong> has been prepared by your onboarding coordinator and is now ready for your signature.</p>
      <p>Please log in to your operator portal and navigate to the <strong>ICA</strong> tab to review and sign your agreement at your earliest convenience.</p>
      <p>Completing your ICA is required before moving forward with Missouri registration and equipment setup.</p>`,
    cta: (appUrl) => ({ label: 'Review & Sign My ICA', url: `${appUrl}/dashboard?tab=ica` }),
  },
  ica_complete: {
    subject: 'ICA Agreement Signed & Complete — SUPERTRANSPORT',
    heading: '✅ ICA Agreement Complete',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>Independent Contractor Agreement (ICA)</strong> is now fully signed and on file with SUPERTRANSPORT LLC.</p>
      <p>This is a major milestone in your onboarding journey. Our team will now proceed with Missouri registration and equipment setup.</p>`,
    cta: (appUrl) => ({ label: 'View My Onboarding Progress', url: `${appUrl}/dashboard` }),
  },
  drug_screening_scheduled: {
    subject: 'Drug Screening Scheduled — SUPERTRANSPORT',
    heading: '🔬 Drug Screening Scheduled',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>pre-employment drug screening</strong> has been scheduled.</p>
      <p>You should receive a separate email with the clinic location and instructions. Please complete your screening as soon as possible to keep your onboarding on track.</p>
      <p>If you have any questions, contact your coordinator at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`,
    cta: (appUrl) => ({ label: 'View My Portal', url: `${appUrl}/dashboard` }),
  },
  mo_reg_filed: {
    subject: 'Missouri Registration Filed — SUPERTRANSPORT',
    heading: '📋 Missouri Registration Submitted',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>Missouri apportioned registration</strong> documents have been submitted to the state on your behalf.</p>
      <p>State approval typically takes <strong>2–4 weeks</strong>. We'll notify you as soon as it's received.</p>
      <p>In the meantime, you can check your onboarding status in your portal.</p>`,
    cta: (appUrl) => ({ label: 'View My Onboarding Progress', url: `${appUrl}/dashboard` }),
  },
  mo_reg_received: {
    subject: 'Missouri Registration Approved — SUPERTRANSPORT',
    heading: '✅ Missouri Registration Received',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your <strong>Missouri apportioned registration</strong> has been approved and is now on file.</p>
      <p>Our team will now move forward with your equipment setup — ELD installation, decal, and fuel card.</p>`,
    cta: (appUrl) => ({ label: 'View My Onboarding Progress', url: `${appUrl}/dashboard` }),
  },
  fully_onboarded: {
    subject: "🎉 You're Fully Onboarded — Welcome to SUPERTRANSPORT!",
    heading: "🎉 Welcome to SUPERTRANSPORT — You're Ready to Roll!",
    body: (name) => `<p>Hi ${name},</p>
      <p>Congratulations! You have officially completed the entire onboarding process and are now a <strong>fully active owner-operator</strong> with SUPERTRANSPORT LLC.</p>
      <p>Here's what comes next:</p>
      <ul style="padding-left:20px;line-height:2.2;">
        <li>Your dispatcher will be reaching out to get you set up with your first load.</li>
        <li>Log in to your portal to view dispatch updates, messages, and documents.</li>
        <li>Questions? Our team is always here at <a href="mailto:dispatch@mysupertransport.com" style="color:#C9A84C;">dispatch@mysupertransport.com</a>.</li>
      </ul>
      <p style="margin-top:16px;">We're thrilled to have you on the road with us. Welcome to the family!</p>`,
    cta: (appUrl) => ({ label: 'Go to My Portal', url: `${appUrl}/dashboard` }),
  },
  document_received: {
    subject: 'Document Received — SUPERTRANSPORT',
    heading: '✅ Document Received & Confirmed',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your onboarding coordinator has confirmed receipt of one of your required documents.</p>
      <p>Log in to your portal to see your updated document status and any remaining items.</p>`,
    cta: (appUrl) => ({ label: 'View My Documents', url: `${appUrl}/dashboard?tab=documents` }),
  },
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
    const { operator_id, milestone_key } = payload as { operator_id: string; milestone_key: string };

    if (!operator_id || !milestone_key) {
      return new Response(JSON.stringify({ error: 'operator_id and milestone_key are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const copy = MILESTONE_COPY[milestone_key];
    if (!copy) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no copy for milestone_key' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve operator's user_id, email, and name ───────────────────────
    const { data: opRow } = await supabaseAdmin
      .from('operators')
      .select('user_id, application_id')
      .eq('id', operator_id)
      .single();

    if (!opRow?.user_id) {
      return new Response(JSON.stringify({ error: 'operator not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check operator email preference for onboarding_update
    const { data: prefRow } = await supabaseAdmin
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', opRow.user_id)
      .eq('event_type', 'onboarding_update')
      .maybeSingle();

    const emailEnabled = prefRow?.email_enabled ?? true; // default: enabled
    if (!emailEnabled) {
      return new Response(JSON.stringify({ skipped: true, reason: 'email disabled by operator preference' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get operator email from auth
    const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(opRow.user_id);
    const operatorEmail = authUser?.email;
    if (!operatorEmail) {
      return new Response(JSON.stringify({ error: 'no email for operator user' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve operator name from application
    let operatorName = 'Driver';
    if (opRow.application_id) {
      const { data: appRow } = await supabaseAdmin
        .from('applications')
        .select('first_name, last_name')
        .eq('id', opRow.application_id)
        .maybeSingle();
      if (appRow) {
        const full = `${appRow.first_name ?? ''} ${appRow.last_name ?? ''}`.trim();
        if (full) operatorName = full;
      }
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const ctaConfig = copy.cta(appUrl);

    const html = buildEmail(
      copy.subject,
      copy.heading,
      copy.body(operatorName),
      ctaConfig
    );

    await sendEmail(operatorEmail, copy.subject, html, RESEND_API_KEY);

    console.log(`[notify-onboarding-update] Sent '${milestone_key}' email to ${operatorEmail}`);

    return new Response(JSON.stringify({ success: true, milestone_key, to: operatorEmail }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-onboarding-update] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
