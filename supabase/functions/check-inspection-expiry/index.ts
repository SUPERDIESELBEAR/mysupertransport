import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Document names that should be checked for expiry ─────────────────────────
// Company-wide docs fetched once, per-driver docs fetched per operator
const COMPANY_WIDE_EXPIRY_DOCS = new Set([
  'IRP Registration',
  'IFTA License',
  'Insurance',
  'UCR',
  'State Specific Permits',
  'Overweight/Oversize Permits',
  'Hazmat',
]);

const PER_DRIVER_EXPIRY_DOCS = new Set([
  'CDL',
  'Medical Certificate',
  'DOT Inspections',
]);

// The subset the user spec calls out explicitly for this feature
const ALERT_DOCS = new Set([
  'IRP Registration',
  'Insurance',
  'IFTA License',
  'CDL',
  'Medical Certificate',
]);

// ─── Email helpers ────────────────────────────────────────────────────────────
function buildEmail(
  subject: string,
  heading: string,
  body: string,
  cta?: { label: string; url: string },
): string {
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
            <p style="margin:0;color:#999;font-size:12px;">SUPERTRANSPORT LLC &nbsp;·&nbsp; Questions? <a href="mailto:support@mysupertransport.com" style="color:#C9A84C;">support@mysupertransport.com</a></p>
            <p style="margin:6px 0 0;color:#bbb;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  resendKey: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
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
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const rawAppUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const appUrl = rawAppUrl.endsWith('/') ? rawAppUrl.slice(0, -1) : rawAppUrl;

    // ── Helper: check email preference (default enabled) ──────────────────
    const userEmailEnabled = async (userId: string, eventType: string): Promise<boolean> => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', userId)
        .eq('event_type', eventType)
        .maybeSingle();
      return data?.email_enabled ?? true;
    };

    // ── Helper: 26-hour dedup check for in-app notifications ──────────────
    const alreadyNotified = async (
      userId: string,
      type: string,
      docName: string,
    ): Promise<boolean> => {
      const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', type)
        .ilike('body', `%${docName}%`)
        .is('read_at', null)
        .gte('sent_at', cutoff)
        .limit(1);
      return (data?.length ?? 0) > 0;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const THRESHOLD = 30; // days
    const notifType = 'inspection_doc_expiry';

    const notificationsToInsert: Array<{
      user_id: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      link: string;
    }> = [];

    let emailsSent = 0;

    // ── 1. Fetch all operators with their profile and assigned staff ───────
    const { data: operators, error: opError } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        assigned_onboarding_staff,
        applications ( first_name, last_name )
      `);

    if (opError) throw opError;
    if (!operators?.length) {
      return new Response(
        JSON.stringify({ message: 'No operators found', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Fetch company-wide docs (shared across all operators) ──────────
    const { data: companyDocs } = await supabase
      .from('inspection_documents')
      .select('id, name, expires_at')
      .eq('scope', 'company_wide')
      .not('expires_at', 'is', null);

    // Index company-wide docs by name (keep the latest if duplicates exist)
    const companyDocMap = new Map<string, { name: string; expires_at: string }>();
    for (const doc of companyDocs ?? []) {
      if (!ALERT_DOCS.has(doc.name)) continue;
      const existing = companyDocMap.get(doc.name);
      if (!existing || doc.expires_at > existing.expires_at) {
        companyDocMap.set(doc.name, doc);
      }
    }

    // ── 3. Identify company-wide docs expiring within threshold ───────────
    const expiringCompanyDocs: { name: string; daysLeft: number; expiryStr: string }[] = [];
    for (const [, doc] of companyDocMap) {
      const expiry = new Date(doc.expires_at);
      expiry.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= THRESHOLD) {
        expiringCompanyDocs.push({
          name: doc.name,
          daysLeft,
          expiryStr: expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        });
      }
    }

    // ── 4. Fetch all per-driver docs expiring within threshold ────────────
    const { data: perDriverDocs } = await supabase
      .from('inspection_documents')
      .select('id, name, expires_at, driver_id')
      .eq('scope', 'per_driver')
      .not('expires_at', 'is', null)
      .not('driver_id', 'is', null);

    // Map driver_id → list of expiring per-driver docs
    const perDriverExpiringMap = new Map<
      string,
      { name: string; daysLeft: number; expiryStr: string }[]
    >();
    for (const doc of perDriverDocs ?? []) {
      if (!ALERT_DOCS.has(doc.name)) continue;
      const expiry = new Date(doc.expires_at);
      expiry.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= THRESHOLD) {
        const driverDocs = perDriverExpiringMap.get(doc.driver_id!) ?? [];
        driverDocs.push({
          name: doc.name,
          daysLeft,
          expiryStr: expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        });
        perDriverExpiringMap.set(doc.driver_id!, driverDocs);
      }
    }

    // ── 5. For each operator: combine company + per-driver expiring docs ───
    for (const op of operators) {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const firstName = app?.first_name ?? 'Driver';
      const operatorName =
        [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';

      // Merge: company-wide docs apply to everyone; per-driver are user-specific
      const driverSpecificDocs = perDriverExpiringMap.get(op.user_id) ?? [];
      const allExpiringDocs = [...expiringCompanyDocs, ...driverSpecificDocs];

      if (allExpiringDocs.length === 0) continue;

      // ── Operator in-app notification ────────────────────────────────────
      for (const doc of allExpiringDocs) {
        const alreadySent = await alreadyNotified(op.user_id, notifType, doc.name);
        if (alreadySent) continue;

        const urgency = doc.daysLeft <= 7 ? '🚨' : doc.daysLeft <= 14 ? '⚠️' : '📋';
        notificationsToInsert.push({
          user_id: op.user_id,
          title: `${urgency} ${doc.name} Expiring in ${doc.daysLeft} Day${doc.daysLeft !== 1 ? 's' : ''}`,
          body: `Your ${doc.name} expires on ${doc.expiryStr}. Check your Inspection Binder to ensure compliance.`,
          type: notifType,
          channel: 'in_app',
          link: '/operator?tab=inspection-binder',
        });
      }

      // ── Operator email (one consolidated email if any docs expiring) ────
      if (RESEND_API_KEY && allExpiringDocs.length > 0) {
        try {
          const emailOk = await userEmailEnabled(op.user_id, 'cert_expiry');
          if (emailOk) {
            const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);
            if (opUser?.email) {
              const mostUrgent = allExpiringDocs.reduce((a, b) => a.daysLeft < b.daysLeft ? a : b);
              const isCritical = mostUrgent.daysLeft <= 7;
              const subject = isCritical
                ? `🚨 Action Required: ${allExpiringDocs.length === 1 ? allExpiringDocs[0].name : `${allExpiringDocs.length} Inspection Documents`} Expiring Soon`
                : `⚠️ Reminder: Inspection Documents Expiring Within 30 Days`;

              const docRows = allExpiringDocs
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .map((d) => {
                  const color = d.daysLeft <= 7 ? '#c0392b' : d.daysLeft <= 14 ? '#e67e22' : '#2980b9';
                  return `<tr>
                    <td style="padding:10px 14px;border:1px solid #eee;font-weight:600;">${d.name}</td>
                    <td style="padding:10px 14px;border:1px solid #eee;color:${color};font-weight:700;">${d.expiryStr}</td>
                    <td style="padding:10px 14px;border:1px solid #eee;color:${color};">${d.daysLeft} day${d.daysLeft !== 1 ? 's' : ''}</td>
                  </tr>`;
                })
                .join('');

              const html = buildEmail(
                subject,
                isCritical ? '🚨 Inspection Documents Expiring Soon' : '⚠️ Inspection Binder — Documents Expiring Within 30 Days',
                `<p>Hi ${firstName},</p>
                 <p>The following documents in your Inspection Binder are expiring within the next 30 days. Expired documents can result in roadside violations — please take action promptly.</p>
                 <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                   <thead>
                     <tr style="background:#f5f5f5;">
                       <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Document</th>
                       <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Expires On</th>
                       <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Days Left</th>
                     </tr>
                   </thead>
                   <tbody>${docRows}</tbody>
                 </table>
                 <p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
                   <strong>What to do:</strong> Log in to your portal and open the <strong>Inspection Binder</strong> tab to review your documents. Contact your coordinator if you need assistance uploading renewed documents.
                 </p>`,
                { label: 'Open Inspection Binder', url: `${appUrl}/operator?tab=inspection-binder` },
              );
              await sendEmail(opUser.email, subject, html, RESEND_API_KEY);
              emailsSent++;
              // Rate-limit: 600ms between sends (Resend 2 req/s limit)
              await new Promise((r) => setTimeout(r, 600));
            }
          } catch (emailErr) {
            console.warn(`Operator email error for ${op.user_id}:`, emailErr);
          }
        }
      }

      // ── Assigned coordinator in-app + email ─────────────────────────────
      if (op.assigned_onboarding_staff) {
        const staffId = op.assigned_onboarding_staff;

        for (const doc of allExpiringDocs) {
          const alreadySent = await alreadyNotified(staffId, notifType, `${operatorName}.*${doc.name}`);
          if (alreadySent) {
            // Fallback: check simpler pattern
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', staffId)
              .eq('type', notifType)
              .ilike('body', `%${operatorName}%`)
              .ilike('body', `%${doc.name}%`)
              .is('read_at', null)
              .gte('sent_at', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
              .limit(1);
            if ((existing?.length ?? 0) > 0) continue;
          }

          const urgency = doc.daysLeft <= 7 ? '🚨' : doc.daysLeft <= 14 ? '⚠️' : '📋';
          notificationsToInsert.push({
            user_id: staffId,
            title: `${urgency} ${operatorName} — ${doc.name} Expiring in ${doc.daysLeft} Day${doc.daysLeft !== 1 ? 's' : ''}`,
            body: `${operatorName}'s ${doc.name} expires on ${doc.expiryStr}. Follow up to ensure the document is renewed.`,
            type: notifType,
            channel: 'in_app',
            link: `/staff?operator=${op.id}`,
          });
        }

        // ── Coordinator email (consolidated) ───────────────────────────────
        if (RESEND_API_KEY && allExpiringDocs.length > 0) {
          try {
            const emailOk = await userEmailEnabled(staffId, 'cert_expiry');
            if (emailOk) {
              const { data: { user: staffUser } } = await supabase.auth.admin.getUserById(staffId);
              if (staffUser?.email) {
                const mostUrgent = allExpiringDocs.reduce((a, b) => a.daysLeft < b.daysLeft ? a : b);
                const isCritical = mostUrgent.daysLeft <= 7;
                const subject = isCritical
                  ? `🚨 Compliance Alert: ${operatorName} — Inspection Documents Expiring`
                  : `⚠️ Notice: ${operatorName} — Inspection Documents Expiring Within 30 Days`;

                const docRows = allExpiringDocs
                  .sort((a, b) => a.daysLeft - b.daysLeft)
                  .map((d) => {
                    const color = d.daysLeft <= 7 ? '#c0392b' : d.daysLeft <= 14 ? '#e67e22' : '#2980b9';
                    return `<tr>
                      <td style="padding:10px 14px;border:1px solid #eee;font-weight:600;">${d.name}</td>
                      <td style="padding:10px 14px;border:1px solid #eee;color:${color};font-weight:700;">${d.expiryStr}</td>
                      <td style="padding:10px 14px;border:1px solid #eee;color:${color};">${d.daysLeft} day${d.daysLeft !== 1 ? 's' : ''}</td>
                    </tr>`;
                  })
                  .join('');

                const html = buildEmail(
                  subject,
                  isCritical
                    ? `🚨 ${operatorName}'s Inspection Documents — Expiring Soon`
                    : `⚠️ ${operatorName} — Inspection Binder Documents Expiring Within 30 Days`,
                  `<p>Hi,</p>
                   <p>The following inspection binder documents for your assigned operator <strong>${operatorName}</strong> are expiring within the next 30 days. Please follow up to ensure compliance.</p>
                   <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                     <thead>
                       <tr style="background:#f5f5f5;">
                         <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Document</th>
                         <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Expires On</th>
                         <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Days Left</th>
                       </tr>
                     </thead>
                     <tbody>${docRows}</tbody>
                   </table>
                   <p>${isCritical
                      ? `<strong>Urgent:</strong> Please contact <strong>${operatorName}</strong> immediately to ensure their documents are renewed before the deadline.`
                      : `No immediate action needed — this is an advance notice. Consider reaching out to <strong>${operatorName}</strong> to confirm they are aware and planning ahead.`
                    }</p>`,
                  { label: 'View Operator Panel', url: `${appUrl}/staff?operator=${op.id}` },
                );
                await sendEmail(staffUser.email, subject, html, RESEND_API_KEY);
                emailsSent++;
                await new Promise((r) => setTimeout(r, 600));
              }
            }
          } catch (emailErr) {
            console.warn(`Staff email error for ${staffId}:`, emailErr);
          }
        }
      }
    }

    // ── Batch insert all in-app notifications ─────────────────────────────
    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);
      if (insertError) throw insertError;
    }

    console.log(
      `check-inspection-expiry: inserted ${notificationsToInsert.length} notifications, sent ${emailsSent} emails`,
    );

    return new Response(
      JSON.stringify({
        message: 'Done',
        inserted: notificationsToInsert.length,
        emailsSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('check-inspection-expiry error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
