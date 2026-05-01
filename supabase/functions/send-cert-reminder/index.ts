import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmailStrict as sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate caller is authenticated staff
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

    const { operator_id, doc_type, days_until, expiration_date } = await req.json() as {
      operator_id: string;
      doc_type: 'CDL' | 'Medical Cert';
      days_until: number;
      expiration_date: string;
    };

    if (!operator_id || !doc_type || days_until === undefined || !expiration_date) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch operator with application data
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        applications (first_name, last_name)
      `)
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
    const expired = days_until < 0;
    const isCritical = !expired && days_until <= 30;

    const expiryDate = new Date(expiration_date);
    const expiryStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let subject: string;
    let heading: string;
    let urgencyBlock: string;

    if (expired) {
      subject = `🚨 Action Required: Your ${doc_type} Has Expired`;
      heading = `🚨 Your ${doc_type} Has Expired`;
      urgencyBlock = `<p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>Expired ${Math.abs(days_until)} day${Math.abs(days_until) !== 1 ? 's' : ''} ago.</strong> You must renew your ${doc_type} and upload the updated document immediately to remain compliant.
      </p>`;
    } else if (isCritical) {
      subject = `⚠️ Reminder: Your ${doc_type} Expires in ${days_until} Days`;
      heading = `⚠️ Your ${doc_type} Expires in ${days_until} Days`;
      urgencyBlock = `<p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>Urgent:</strong> Only ${days_until} day${days_until !== 1 ? 's' : ''} remaining. Please renew immediately to stay compliant and continue operating.
      </p>`;
    } else {
      subject = `📅 Reminder: Your ${doc_type} Expires in ${days_until} Days`;
      heading = `📅 Your ${doc_type} is Expiring Soon`;
      urgencyBlock = `<p style="background:#f0f7ff;border-left:4px solid #3498db;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <strong>Heads up:</strong> You have ${days_until} days — we recommend starting the renewal process now to avoid any last-minute issues.
      </p>`;
    }

    const html = buildEmail(
      subject,
      heading,
      `<p>Hi ${firstName},</p>
       <p>This is a reminder from your SUPERTRANSPORT onboarding coordinator regarding your <strong>${doc_type}</strong>.</p>
       <p>Your ${doc_type} ${expired ? 'expired' : 'is set to expire'} on <strong>${expiryStr}</strong>${expired ? '' : ` — ${days_until} day${days_until !== 1 ? 's' : ''} from now`}.</p>
       ${urgencyBlock}
       <p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
         <strong>How to upload:</strong> Log in to your operator portal → Progress tab → Upload your renewed ${doc_type}.
       </p>`,
      { label: 'View My Portal', url: `${appUrl}/operator/progress` }
    );

    // Get caller profile name (needed for audit log + reminder record)
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', caller.id)
      .maybeSingle();
    const callerName = callerProfile
      ? [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ').trim() || caller.email
      : caller.email;

    // Attempt email first — capture outcome
    let emailError: string | null = null;
    try {
      await sendEmail(opUser.email, subject, html, RESEND_API_KEY);
    } catch (err) {
      emailError = String(err);
      console.warn('send-cert-reminder email error (reminder still recorded):', emailError);
    }

    // Always insert a new cert_reminders record — regardless of email outcome
    // (unique constraint removed so every attempt creates a history row)
    await supabase.from('cert_reminders').insert({
      operator_id,
      doc_type,
      sent_at: new Date().toISOString(),
      sent_by: caller.id,
      sent_by_name: callerName,
      email_sent: emailError === null,
      email_error: emailError,
    });

    // Post-send writes (in-app notification + audit log) in parallel
    await Promise.all([
      // In-app notification for the operator
      supabase.from('notifications').insert({
        user_id: op.user_id,
        title: `${doc_type} Reminder Sent`,
        body: `Your coordinator sent you a reminder about your ${doc_type} ${expired ? 'expiration' : `expiring in ${days_until} day${days_until !== 1 ? 's' : ''}`}.`,
        type: 'cert_expiry_reminder',
        channel: 'in_app',
        link: '/operator/progress',
      }),

      // Audit log entry
      supabase.from('audit_log').insert({
        actor_id: caller.id,
        actor_name: callerName,
        entity_type: 'operator',
        entity_id: operator_id,
        entity_label: fullName,
        action: 'cert_reminder_sent',
        metadata: { doc_type, days_until, expiration_date, operator_email: opUser.email, email_error: emailError },
      }),
    ]);

    return new Response(
      JSON.stringify({ success: true, sent_to: opUser.email, email_error: emailError ?? undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-cert-reminder error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
