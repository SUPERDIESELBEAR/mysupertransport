import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, sendEmail } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app').replace(/\/$/, '');

    // ── Helper: check if user has email enabled for a specific event type ──
    // 30-day threshold → event_type: 'cert_expiry'
    // 60-day threshold → event_type: 'cert_expiry_60day' (independently controllable)
    const userEmailEnabled = async (userId: string, eventType: string): Promise<boolean> => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', userId)
        .eq('event_type', eventType)
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

    // Use US Central Time for "today"
    const ctStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    const today = new Date(ctStr);
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
          const isEmailThreshold = EMAIL_THRESHOLDS.has(threshold);
          const isCritical = threshold === 30;

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

          // ── Operator email at 30-day and 60-day thresholds ──
          if (isEmailThreshold && RESEND_API_KEY && opNotifInserted) {
            try {
              const prefEventType = threshold === 60 ? 'cert_expiry_60day' : 'cert_expiry';
              const emailOk = await userEmailEnabled(op.user_id, prefEventType);
              if (emailOk) {
                const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);
                if (opUser?.email) {
                  const subject = isCritical
                    ? `⚠️ Action Required: Your ${doc.label} Expires in ${daysLeft} Days`
                    : `📅 Early Reminder: Your ${doc.label} Expires in ${daysLeft} Days`;
                  const heading = isCritical
                    ? `⚠️ Your ${doc.label} Expires in ${daysLeft} Days`
                    : `📅 Early Reminder — ${doc.label} Expiring in ${daysLeft} Days`;
                  const urgencyNote = isCritical
                    ? `<p style="background:#fff0f0;border-left:4px solid #e74c3c;padding:12px 16px;border-radius:4px;margin-top:16px;">
                         <strong>Urgent:</strong> Only ${daysLeft} days remain. Renew immediately to stay compliant and continue operating.
                       </p>`
                    : `<p style="background:#f0f7ff;border-left:4px solid #3498db;padding:12px 16px;border-radius:4px;margin-top:16px;">
                         <strong>Heads up:</strong> You have ${daysLeft} days — plenty of time to renew. We recommend starting the process now to avoid any last-minute issues.
                       </p>`;
                  const html = buildEmail(
                    subject,
                    heading,
                    `<p>Hi ${operatorFirstName},</p>
                     <p>This is ${isCritical ? 'an important reminder' : 'an early heads-up'} that your <strong>${doc.label}</strong> is set to expire on <strong>${expiryStr}</strong> — ${daysLeft} days from now.</p>
                     <p>${isCritical ? 'To remain compliant and continue operating, please renew your ' + doc.label + ' as soon as possible and upload the updated document to your portal.' : 'Getting ahead of this now means less stress later. When your renewed ' + doc.label + ' is ready, simply upload it to your operator portal.'}</p>
                     ${urgencyNote}
                     <p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
                       <strong>How to upload:</strong> Log in to your operator portal → Progress tab → Upload your renewed ${doc.label}.
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

            // ── Staff email at 30-day and 60-day thresholds ──
            if (isEmailThreshold && RESEND_API_KEY && staffNotifInserted) {
              try {
                const prefEventType = threshold === 60 ? 'cert_expiry_60day' : 'cert_expiry';
                const emailOk = await userEmailEnabled(op.assigned_onboarding_staff, prefEventType);
                if (emailOk) {
                  const { data: { user: staffUser } } = await supabase.auth.admin.getUserById(op.assigned_onboarding_staff);
                  if (staffUser?.email) {
                    const subject = isCritical
                      ? `⚠️ Compliance Alert: ${operatorName} — ${doc.label} Expiring in ${daysLeft} Days`
                      : `📅 Early Notice: ${operatorName} — ${doc.label} Expiring in ${daysLeft} Days`;
                    const heading = isCritical
                      ? `⚠️ ${operatorName}'s ${doc.label} Expires in ${daysLeft} Days`
                      : `📅 Early Notice — ${operatorName}'s ${doc.label} Expiring in ${daysLeft} Days`;
                    const expiresColor = isCritical ? '#c0392b' : '#2980b9';
                    const html = buildEmail(
                      subject,
                      heading,
                      `<p>Hi,</p>
                       <p>This is ${isCritical ? 'a compliance alert' : 'an early notice'} for one of your assigned operators.</p>
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
                           <td style="padding:10px 14px;border:1px solid #eee;color:${expiresColor};font-weight:700;">${expiryStr}</td>
                         </tr>
                         <tr>
                           <td style="padding:10px 14px;font-weight:700;color:#555;border:1px solid #eee;">Days Remaining</td>
                           <td style="padding:10px 14px;border:1px solid #eee;">${daysLeft} days</td>
                         </tr>
                       </table>
                       <p>${isCritical
                         ? `Please follow up with <strong>${operatorName}</strong> immediately to ensure their ${doc.label} is renewed before the expiration date.`
                         : `No immediate action needed — this is an early heads-up. Consider reaching out to <strong>${operatorName}</strong> to make sure they're aware and planning ahead.`
                       }</p>`,
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
