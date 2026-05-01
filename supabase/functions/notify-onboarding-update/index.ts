import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, ONBOARDING_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Milestone email templates ────────────────────────────────────────────────
const MILESTONE_COPY: Record<string, {
  subject: string;
  heading: string;
  body: (name: string, extra?: string) => string;
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
      <p>Your <strong>Independent Contractor Agreement (ICA)</strong> is now fully signed and on file with SUPERTRANSPORT.</p>
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
      <p>Congratulations! You have officially completed the entire onboarding process and are now a <strong>fully active owner-operator</strong> with SUPERTRANSPORT.</p>
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
  decal_photos_requested: {
    subject: 'Action Required: Upload Decal Installation Photos — SUPERTRANSPORT',
    heading: '📸 Upload Your Decal Photos',
    body: (name) => `<p>Hi ${name},</p>
      <p>Your company decal has been applied to your truck — great progress!</p>
      <p>To complete this step, please upload <strong>two photos</strong> of the installed decal:</p>
      <ul style="padding-left:20px;line-height:2.2;">
        <li><strong>Driver-side</strong> photo showing the decal clearly visible</li>
        <li><strong>Passenger-side</strong> photo showing the decal clearly visible</li>
      </ul>
      <p>Log in to your portal and go to the <strong>Documents</strong> tab to upload your photos.</p>`,
    cta: (appUrl) => ({ label: 'Upload Decal Photos', url: `${appUrl}/dashboard?tab=documents` }),
  },
  go_live_set: {
    subject: '🚛 Your Go-Live Date is Confirmed — SUPERTRANSPORT',
    heading: '🚛 You\'re Cleared to Start Dispatching!',
    body: (name, goLiveDate) => `<p>Hi ${name},</p>
      <p>Congratulations — your onboarding is complete and your <strong>go-live date has been officially confirmed${goLiveDate ? ` for ${goLiveDate}` : ''}</strong>.</p>
      <p>Here's what to expect next:</p>
      <ul style="padding-left:20px;line-height:2.2;">
        <li>Expect a call from our dispatch team at <a href="mailto:dispatch@mysupertransport.com" style="color:#C9A84C;">dispatch@mysupertransport.com</a> to get you set up with your first load assignment.</li>
        <li>Log in to your portal to monitor your <strong>dispatch status</strong> and messages.</li>
        <li>Keep your ELD active and your fuel card on hand — you're ready to roll.</li>
        <li>Questions before your start date? Reach your coordinator at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</li>
      </ul>
      <p style="margin-top:16px;">We're excited to have you on the road with us. Welcome to the SUPERTRANSPORT family!</p>`,
    cta: (appUrl) => ({ label: 'Go to My Portal', url: `${appUrl}/dashboard` }),
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

    const defaultCopy = MILESTONE_COPY[milestone_key];
    if (!defaultCopy) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no copy for milestone_key' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for a custom DB-managed template override
    const { data: dbTemplate } = await supabaseAdmin
      .from('email_templates')
      .select('subject, heading, body_html, cta_label')
      .eq('milestone_key', milestone_key)
      .maybeSingle();

    // Build a merged copy object — DB values override defaults
    const copy = dbTemplate ? {
      subject: dbTemplate.subject,
      heading: dbTemplate.heading,
      body: (name: string, extra?: string) => {
        // Replace {{name}} and {{extra}} placeholders in DB template
        let html = dbTemplate.body_html.replace(/\{\{name\}\}/g, name);
        if (extra) html = html.replace(/\{\{extra\}\}/g, extra);
        return html;
      },
      cta: (appUrl: string) => ({
        label: dbTemplate.cta_label || defaultCopy.cta(appUrl).label,
        url: defaultCopy.cta(appUrl).url, // URL always uses the default routing
      }),
    } : defaultCopy;

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

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const ctaConfig = copy.cta(appUrl);

    // ── Fetch extra context for specific milestones ───────────────────────
    let extraContext: string | undefined;
    if (milestone_key === 'go_live_set') {
      const { data: osRow } = await supabaseAdmin
        .from('onboarding_status')
        .select('go_live_date')
        .eq('operator_id', operator_id)
        .maybeSingle();
      if (osRow?.go_live_date) {
        // Format as "January 15, 2025"
        const d = new Date(osRow.go_live_date + 'T00:00:00');
        extraContext = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    }

    const html = buildEmail(
      copy.subject,
      copy.heading,
      copy.body(operatorName, extraContext),
      ctaConfig,
      ONBOARDING_EMAIL   // footer shows onboarding@ for this function
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
