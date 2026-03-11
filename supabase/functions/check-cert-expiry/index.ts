import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Email helpers (mirrors send-notification pattern) ───────────────────────
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
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:recruiting@mysupertransport.com" style="color:#C9A84C;">recruiting@mysupertransport.com</a></p>
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

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const appUrl = 'https://id-preview--ab645bc4-83af-495c-aca5-d40c7ca0fb70.lovable.app';

    // ── Helper: check if user has email enabled for cert_expiry events ──
    const userEmailEnabled = async (userId: string): Promise<boolean> => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', userId)
        .eq('event_type', 'cert_expiry')
        .maybeSingle();
      return data?.email_enabled ?? true; // default enabled
    };

    // Fetch all operators with their application data and assigned staff
    const { data: operators, error: opError } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        assigned_onboarding_staff,
        applications (
          first_name,
          last_name,
          cdl_expiration,
          medical_cert_expiration
        )
      `);

    if (opError) throw opError;
    if (!operators || operators.length === 0) {
      return new Response(JSON.stringify({ message: 'No operators found', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ALERT_DAYS = [90, 60, 30];
    const EMAIL_THRESHOLDS = new Set([30, 60]); // Send emails at both thresholds

    const notificationsToInsert: Array<{
      user_id: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      link: string;
    }> = [];

    const queued = new Set<string>();
    let emailsSent = 0;

    for (const op of operators) {
      const app = Array.isArray(op.applications)
        ? op.applications[0]
        : op.applications;

      if (!app) continue;

      const operatorFirstName = app.first_name || 'Driver';
      const operatorName =
        [app.first_name, app.last_name].filter(Boolean).join(' ').trim() || 'Your';

      const docs: { label: string; field: string; expDate: string | null }[] = [
        { label: 'CDL', field: 'cdl', expDate: app.cdl_expiration },
        { label: 'Medical Certificate', field: 'med_cert', expDate: app.medical_cert_expiration },
      ];

      for (const doc of docs) {
        if (!doc.expDate) continue;

        const expiry = new Date(doc.expDate);
        expiry.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        for (const threshold of ALERT_DAYS) {
          if (Math.abs(daysLeft - threshold) > 1) continue;

          const notifType = `cert_expiry_${threshold}d`;
          const expiryStr = expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const isEmailThreshold = threshold === EMAIL_THRESHOLD;

          // ── Operator in-app notification ──
          const opKey = `${op.user_id}|${notifType}|${doc.field}`;
          let opNotifInserted = false;
          if (!queued.has(opKey)) {
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', op.user_id)
              .eq('type', notifType)
              .ilike('body', `%${doc.label}%`)
              .is('read_at', null)
              .gte('sent_at', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (!existing || existing.length === 0) {
              notificationsToInsert.push({
                user_id: op.user_id,
                title: `${doc.label} Expiring in ${daysLeft} Days`,
                body: `Your ${doc.label} expires on ${expiryStr}. Please renew it promptly to stay compliant.`,
                type: notifType,
                channel: 'in_app',
                link: '/operator/progress',
              });
              queued.add(opKey);
              opNotifInserted = true;
            }
          }

          // ── Operator email at 30-day threshold ──
          if (isEmailThreshold && RESEND_API_KEY && opNotifInserted) {
            try {
              const emailOk = await userEmailEnabled(op.user_id);
              if (emailOk) {
                const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);
                if (opUser?.email) {
                  const subject = `⚠️ Action Required: Your ${doc.label} Expires in ${daysLeft} Days`;
                  const html = buildEmail(
                    subject,
                    `⚠️ Your ${doc.label} Expires in ${daysLeft} Days`,
                    `<p>Hi ${operatorFirstName},</p>
                     <p>This is an important reminder that your <strong>${doc.label}</strong> is set to expire on <strong>${expiryStr}</strong> — just ${daysLeft} days away.</p>
                     <p>To remain compliant and continue operating, please renew your ${doc.label} as soon as possible and upload the updated document to your portal.</p>
                     <p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
                       <strong>What to do:</strong> Log in to your operator portal → Progress tab → Upload your renewed ${doc.label}.
                     </p>`,
                    { label: 'View My Portal', url: `${appUrl}/operator/progress` }
                  );
                  await sendEmail(opUser.email, subject, html, RESEND_API_KEY);
                  emailsSent++;
                }
              }
            } catch (emailErr) {
              console.warn('Operator email error:', emailErr);
            }
          }

          // ── Assigned onboarding staff in-app notification ──
          if (op.assigned_onboarding_staff) {
            const staffKey = `${op.assigned_onboarding_staff}|${notifType}|${doc.field}|${op.id}`;
            let staffNotifInserted = false;
            if (!queued.has(staffKey)) {
              const { data: existingStaff } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', op.assigned_onboarding_staff)
                .eq('type', notifType)
                .ilike('body', `%${operatorName}%`)
                .ilike('body', `%${doc.label}%`)
                .is('read_at', null)
                .gte('sent_at', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
                .limit(1);

              if (!existingStaff || existingStaff.length === 0) {
                notificationsToInsert.push({
                  user_id: op.assigned_onboarding_staff,
                  title: `${operatorName} — ${doc.label} Expiring in ${daysLeft} Days`,
                  body: `${operatorName}'s ${doc.label} expires on ${expiryStr}. Follow up to ensure renewal.`,
                  type: notifType,
                  channel: 'in_app',
                  link: `/staff?operator=${op.id}`,
                });
                queued.add(staffKey);
                staffNotifInserted = true;
              }
            }

            // ── Staff email at 30-day threshold ──
            if (isEmailThreshold && RESEND_API_KEY && staffNotifInserted) {
              try {
                const emailOk = await userEmailEnabled(op.assigned_onboarding_staff);
                if (emailOk) {
                  const { data: { user: staffUser } } = await supabase.auth.admin.getUserById(op.assigned_onboarding_staff);
                  if (staffUser?.email) {
                    const subject = `⚠️ Compliance Alert: ${operatorName} — ${doc.label} Expiring in ${daysLeft} Days`;
                    const html = buildEmail(
                      subject,
                      `⚠️ ${operatorName}'s ${doc.label} Expires in ${daysLeft} Days`,
                      `<p>Hi,</p>
                       <p>This is a compliance alert for one of your assigned operators.</p>
                       <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                         <tr style="background:#f5f5f5;">
                           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;width:40%;">Operator</td>
                           <td style="padding:10px 14px;border:1px solid #eee;">${operatorName}</td>
                         </tr>
                         <tr>
                           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Document</td>
                           <td style="padding:10px 14px;border:1px solid #eee;">${doc.label}</td>
                         </tr>
                         <tr style="background:#f5f5f5;">
                           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Expires On</td>
                           <td style="padding:10px 14px;border:1px solid #eee;color:#c0392b;font-weight:700;">${expiryStr}</td>
                         </tr>
                         <tr>
                           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Days Remaining</td>
                           <td style="padding:10px 14px;border:1px solid #eee;">${daysLeft} days</td>
                         </tr>
                       </table>
                       <p>Please follow up with <strong>${operatorName}</strong> to ensure their ${doc.label} is renewed before the expiration date.</p>`,
                      { label: 'View Operator Panel', url: `${appUrl}/staff?operator=${op.id}` }
                    );
                    await sendEmail(staffUser.email, subject, html, RESEND_API_KEY);
                    emailsSent++;
                  }
                }
              } catch (emailErr) {
                console.warn('Staff email error:', emailErr);
              }
            }
          }

          break; // Only fire the closest matching threshold per doc per operator
        }
      }
    }

    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);
      if (insertError) throw insertError;
    }

    console.log(`check-cert-expiry: inserted ${notificationsToInsert.length} notifications, sent ${emailsSent} emails`);

    return new Response(
      JSON.stringify({ message: 'Done', inserted: notificationsToInsert.length, emailsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('check-cert-expiry error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
