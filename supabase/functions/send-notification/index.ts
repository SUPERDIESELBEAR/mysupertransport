import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type NotificationType =
  | 'new_application'
  | 'application_approved'
  | 'application_denied'
  | 'onboarding_milestone'
  | 'document_uploaded';

interface NotificationPayload {
  type: NotificationType;
  applicant_name?: string;
  applicant_email?: string;
  operator_name?: string;
  milestone?: string;
  document_type?: string;
  operator_id?: string;
  reviewer_notes?: string;
}

// ─── Email HTML builder ─────────────────────────────────────────────────────
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
        <!-- Header -->
        <tr>
          <td style="background:#0f1117;padding:24px 40px;border-bottom:3px solid #C9A84C;">
            <p style="margin:0;color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:2px;">SUPERTRANSPORT</p>
            <p style="margin:4px 0 0;color:#888;font-size:12px;letter-spacing:1px;">DRIVER OPERATIONS</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#0f1117;font-weight:700;">${heading}</h1>
            <div style="color:#444;font-size:15px;line-height:1.7;">${body}</div>
            ${ctaHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:recruiting@supertransportllc.com" style="color:#C9A84C;">recruiting@supertransportllc.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
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
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SUPERTRANSPORT <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error [${res.status}]: ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload: NotificationPayload = await req.json();
    const { type } = payload;

    // ── Helper: get all management/staff emails ──────────────────────────
    const getManagementEmails = async (): Promise<string[]> => {
      const { data: mgmtRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .in('role', ['management', 'onboarding_staff']);

      if (!mgmtRoles?.length) return [];

      const userIds = mgmtRoles.map(r => r.user_id);
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      return users?.filter(u => userIds.includes(u.id) && u.email).map(u => u.email!) ?? [];
    };

    // ── Helper: get assigned staff email for an operator ─────────────────
    const getAssignedStaffEmail = async (operatorId: string): Promise<string | null> => {
      const { data: op } = await supabaseAdmin
        .from('operators')
        .select('assigned_onboarding_staff')
        .eq('id', operatorId)
        .single();

      if (!op?.assigned_onboarding_staff) return null;
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(op.assigned_onboarding_staff);
      return user?.email ?? null;
    };

    const appUrl = 'https://id-preview--ab645bc4-83af-495c-aca5-d40c7ca0fb70.lovable.app';

    // ── Route by notification type ───────────────────────────────────────
    switch (type) {

      case 'new_application': {
        const name = payload.applicant_name || 'A new applicant';
        const email = payload.applicant_email || '';
        const mgmtEmails = await getManagementEmails();

        if (mgmtEmails.length === 0) break;

        const subject = `New Application: ${name}`;
        const html = buildEmail(
          subject,
          '📋 New Driver Application Received',
          `<p>A new driver application has been submitted and is ready for review.</p>
           <p><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}</p>
           <p>Please log in to the Management Portal to review and take action.</p>`,
          { label: 'Review Application', url: `${appUrl}/management` }
        );

        await Promise.all(mgmtEmails.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        break;
      }

      case 'application_approved': {
        const name = payload.applicant_name || 'Applicant';
        const email = payload.applicant_email;
        if (!email) break;

        const subject = 'Your SUPERTRANSPORT Application Has Been Approved!';
        const html = buildEmail(
          subject,
          '🎉 Congratulations — You\'ve Been Approved!',
          `<p>Dear ${name},</p>
           <p>We are thrilled to let you know that your driver application with <strong>SUPERTRANSPORT LLC</strong> has been <strong>approved</strong>.</p>
           <p>You should receive a separate email shortly with a link to set up your SUPERTRANSPORT account. Once you log in, you'll be able to track your onboarding progress.</p>
           <p>Welcome to the SUPERTRANSPORT family — we're excited to have you on board!</p>
           ${payload.reviewer_notes ? `<p style="background:#f9f5e9;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;"><strong>Note from our team:</strong> ${payload.reviewer_notes}</p>` : ''}`,
          { label: 'Set Up Your Account', url: `${appUrl}/login` }
        );

        await sendEmail(email, subject, html, RESEND_API_KEY);
        break;
      }

      case 'application_denied': {
        const name = payload.applicant_name || 'Applicant';
        const email = payload.applicant_email;
        if (!email) break;

        const subject = 'Update on Your SUPERTRANSPORT Application';
        const html = buildEmail(
          subject,
          'Application Status Update',
          `<p>Dear ${name},</p>
           <p>Thank you for taking the time to apply with <strong>SUPERTRANSPORT LLC</strong>. After careful review, we are unable to move forward with your application at this time.</p>
           ${payload.reviewer_notes ? `<p style="background:#fff5f5;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;"><strong>Reason:</strong> ${payload.reviewer_notes}</p>` : ''}
           <p>We appreciate your interest in SUPERTRANSPORT and wish you the best in your search.</p>
           <p>If you have questions, please reach out to us directly at <a href="mailto:recruiting@supertransportllc.com" style="color:#C9A84C;">recruiting@supertransportllc.com</a>.</p>`
        );

        await sendEmail(email, subject, html, RESEND_API_KEY);
        break;
      }

      case 'onboarding_milestone': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        const staffEmail = await getAssignedStaffEmail(operatorId);
        const mgmtEmails = await getManagementEmails();
        const recipients = [...new Set([...(staffEmail ? [staffEmail] : []), ...mgmtEmails])];
        if (!recipients.length) break;

        const name = payload.operator_name || 'An operator';
        const milestone = payload.milestone || 'a step';
        const subject = `Onboarding Update: ${name}`;
        const html = buildEmail(
          subject,
          '✅ Onboarding Milestone Reached',
          `<p><strong>${name}</strong> has completed a step in their onboarding process.</p>
           <p><strong>Milestone:</strong> ${milestone}</p>
           <p>Log in to the Staff Portal to view their full onboarding status.</p>`,
          { label: 'View Pipeline', url: `${appUrl}/staff` }
        );

        await Promise.all(recipients.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        break;
      }

      case 'document_uploaded': {
        const operatorId = payload.operator_id;
        if (!operatorId) break;

        const staffEmail = await getAssignedStaffEmail(operatorId);
        const mgmtEmails = await getManagementEmails();
        const recipients = [...new Set([...(staffEmail ? [staffEmail] : []), ...mgmtEmails])];
        if (!recipients.length) break;

        const name = payload.operator_name || 'An operator';
        const docType = payload.document_type || 'a document';
        const subject = `Document Uploaded: ${name}`;
        const html = buildEmail(
          subject,
          '📎 New Document Requires Review',
          `<p><strong>${name}</strong> has uploaded a document that may require your review.</p>
           <p><strong>Document type:</strong> ${docType}</p>
           <p>Log in to the Staff Portal to view and approve the document.</p>`,
          { label: 'Review Document', url: `${appUrl}/staff` }
        );

        await Promise.all(recipients.map(e => sendEmail(e, subject, html, RESEND_API_KEY)));
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown notification type: ${type}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-notification error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
