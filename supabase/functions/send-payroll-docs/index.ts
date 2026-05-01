import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmailStrict, BRAND_COLOR, BRAND_DARK, ONBOARDING_EMAIL, BRAND_NAME } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is staff
    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .in('role', ['onboarding_staff', 'dispatcher', 'management']);
    if (!callerRoles?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');

    const { operator_id } = await req.json() as { operator_id: string };
    if (!operator_id) {
      return new Response(JSON.stringify({ error: 'Missing operator_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch operator + application name
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('id, user_id, applications (first_name, last_name)')
      .eq('id', operator_id)
      .single();
    if (opErr || !op) {
      return new Response(JSON.stringify({ error: 'Operator not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
    const firstName = app?.first_name || 'Driver';
    const fullName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';

    // Get operator email
    const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);
    if (!opUser?.email) {
      return new Response(JSON.stringify({ error: 'Operator email not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app').replace(/\/$/, '');

    // Generate short-lived signed URLs for both documents
    const [overviewResult, calendarResult] = await Promise.all([
      supabase.storage.from('operator-documents').createSignedUrl('company-docs/payroll-deposit-overview.pdf', 604800), // 7 days
      supabase.storage.from('operator-documents').createSignedUrl('company-docs/payroll-calendar.pdf', 604800),
    ]);

    const overviewUrl = overviewResult.data?.signedUrl ?? `${appUrl}/operator`;
    const calendarUrl = calendarResult.data?.signedUrl ?? `${appUrl}/operator`;

    const subject = '📄 Your Payroll Documents — SUPERTRANSPORT';

    const html = buildEmail(
      subject,
      '📄 Your Payroll Reference Documents',
      `<p>Hi ${firstName},</p>
       <p>Your onboarding coordinator has shared the following payroll reference documents with you. Please review both documents carefully as part of completing your pay setup.</p>

       <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr>
           <td style="padding:0 0 12px;">
             <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fafafa;">
               <tr>
                 <td style="padding:18px 20px;">
                   <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${BRAND_DARK};">📋 Payroll Deposit Overview</p>
                   <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">Direct deposit policy & pay structure — how and when you get paid.</p>
                   <a href="${overviewUrl}" style="display:inline-block;background:${BRAND_COLOR};color:${BRAND_DARK};padding:10px 22px;border-radius:7px;text-decoration:none;font-weight:700;font-size:13px;">View Document →</a>
                 </td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td style="padding:0 0 12px;">
             <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fafafa;">
               <tr>
                 <td style="padding:18px 20px;">
                   <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${BRAND_DARK};">📅 Payroll Calendar</p>
                   <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">Weekly settlement schedule & pay dates.</p>
                   <a href="${calendarUrl}" style="display:inline-block;background:${BRAND_COLOR};color:${BRAND_DARK};padding:10px 22px;border-radius:7px;text-decoration:none;font-weight:700;font-size:13px;">View Document →</a>
                 </td>
               </tr>
             </table>
           </td>
         </tr>
       </table>

       <p style="background:#fff8e6;border-left:4px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;font-size:13px;color:#555;">
         <strong>Note:</strong> Document links expire in 7 days. To view them again, log in to your operator portal and complete Pay Setup.
       </p>`,
      { label: 'Open My Portal', url: `${appUrl}/operator` }
    );

    // Get caller name for audit log
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', caller.id)
      .maybeSingle();
    const callerName = callerProfile
      ? [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ').trim() || caller.email
      : caller.email;

    // Send email
    let emailError: string | null = null;
    try {
      await sendEmailStrict(opUser.email, subject, html, RESEND_API_KEY);
    } catch (err) {
      emailError = String(err);
    }

    // In-app notification + audit log in parallel
    await Promise.all([
      supabase.from('notifications').insert({
        user_id: op.user_id,
        title: '📄 Payroll documents shared',
        body: 'Your coordinator sent you the Payroll Deposit Overview and Payroll Calendar. Check your email.',
        type: 'onboarding_update',
        channel: 'in_app',
        link: '/operator',
      }),
      supabase.from('audit_log').insert({
        actor_id: caller.id,
        actor_name: callerName,
        entity_type: 'operator',
        entity_id: operator_id,
        entity_label: fullName,
        action: 'payroll_docs_sent',
        metadata: { operator_email: opUser.email, email_error: emailError },
      }),
    ]);

    if (emailError) throw new Error(emailError);

    return new Response(
      JSON.stringify({ success: true, sent_to: opUser.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-payroll-docs error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
