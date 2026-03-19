import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Documents to check for expiry alerts
const ALERT_DOCS = new Set([
  "IRP Registration (cab card)",
  "Insurance",
  "IFTA License",
  "CDL",
  "Medical Certificate",
]);

// ─── Email HTML builder ───────────────────────────────────────────────────────
function buildEmail(subject: string, heading: string, body: string, ctaLabel: string, ctaUrl: string): string {
  const ctaHtml = `<div style="text-align:center;margin:32px 0;">
    <a href="${ctaUrl}" style="background:#C9A84C;color:#0f1117;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
      ${ctaLabel}
    </a>
  </div>`;
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

async function sendEmail(to: string, subject: string, html: string, resendKey: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SUPERTRANSPORT <onboarding@mysupertransport.com>",
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

function buildDocTable(docs: { name: string; daysLeft: number; expiryStr: string }[]): string {
  const rows = docs
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((d) => {
      const color = d.daysLeft <= 7 ? "#c0392b" : d.daysLeft <= 14 ? "#e67e22" : "#2980b9";
      return `<tr>
        <td style="padding:10px 14px;border:1px solid #eee;font-weight:600;">${d.name}</td>
        <td style="padding:10px 14px;border:1px solid #eee;color:${color};font-weight:700;">${d.expiryStr}</td>
        <td style="padding:10px 14px;border:1px solid #eee;color:${color};">${d.daysLeft} day${d.daysLeft !== 1 ? "s" : ""}</td>
      </tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Document</th>
        <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Expires On</th>
        <th style="padding:10px 14px;border:1px solid #eee;text-align:left;color:#555;">Days Left</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const rawAppUrl = Deno.env.get("APP_URL") ?? "https://mysupertransport.com";
    const appUrl = rawAppUrl.endsWith("/") ? rawAppUrl.slice(0, -1) : rawAppUrl;

    // ── Helper: check email preference ────────────────────────────────────
    const userEmailEnabled = async (userId: string, eventType: string): Promise<boolean> => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("email_enabled")
        .eq("user_id", userId)
        .eq("event_type", eventType)
        .maybeSingle();
      return data?.email_enabled ?? true;
    };

    // ── Helper: 26-hour dedup check ───────────────────────────────────────
    const alreadyNotified = async (userId: string, type: string, docName: string): Promise<boolean> => {
      const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", type)
        .ilike("body", "%" + docName + "%")
        .is("read_at", null)
        .gte("sent_at", cutoff)
        .limit(1);
      return (data?.length ?? 0) > 0;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const THRESHOLD = 30;
    const notifType = "inspection_doc_expiry";

    const notificationsToInsert: Array<{
      user_id: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      link: string;
    }> = [];

    let emailsSent = 0;

    // ── 1. Fetch all operators ────────────────────────────────────────────
    const { data: operators, error: opError } = await supabase
      .from("operators")
      .select("id, user_id, assigned_onboarding_staff, applications ( first_name, last_name )");

    if (opError) throw opError;
    if (!operators?.length) {
      return new Response(
        JSON.stringify({ message: "No operators found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Fetch company-wide docs (shared across all operators) ──────────
    const { data: companyDocs } = await supabase
      .from("inspection_documents")
      .select("name, expires_at")
      .eq("scope", "company_wide")
      .not("expires_at", "is", null);

    // Keep the latest company-wide doc per name
    const companyDocMap = new Map<string, string>(); // name → expires_at
    for (const doc of companyDocs ?? []) {
      if (!ALERT_DOCS.has(doc.name)) continue;
      const existing = companyDocMap.get(doc.name);
      if (!existing || doc.expires_at > existing) {
        companyDocMap.set(doc.name, doc.expires_at);
      }
    }

    // ── 3. Identify company-wide docs expiring within threshold ───────────
    type ExpiringDoc = { name: string; daysLeft: number; expiryStr: string };
    const expiringCompanyDocs: ExpiringDoc[] = [];
    for (const [name, expiresAt] of companyDocMap) {
      const expiry = new Date(expiresAt);
      expiry.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= THRESHOLD) {
        expiringCompanyDocs.push({
          name,
          daysLeft,
          expiryStr: expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
      }
    }

    // ── 4. Fetch all per-driver docs expiring within threshold ────────────
    const { data: perDriverDocs } = await supabase
      .from("inspection_documents")
      .select("name, expires_at, driver_id")
      .eq("scope", "per_driver")
      .not("expires_at", "is", null)
      .not("driver_id", "is", null);

    // Map driver_id → expiring per-driver docs
    const perDriverExpiringMap = new Map<string, ExpiringDoc[]>();
    for (const doc of perDriverDocs ?? []) {
      if (!ALERT_DOCS.has(doc.name)) continue;
      const expiry = new Date(doc.expires_at);
      expiry.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= THRESHOLD) {
        const driverId = doc.driver_id as string;
        const arr = perDriverExpiringMap.get(driverId) ?? [];
        arr.push({
          name: doc.name,
          daysLeft,
          expiryStr: expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
        perDriverExpiringMap.set(driverId, arr);
      }
    }

    // ── 5. Process each operator ──────────────────────────────────────────
    for (const op of operators) {
      const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
      const firstName = (app as any)?.first_name ?? "Driver";
      const operatorName =
        [(app as any)?.first_name, (app as any)?.last_name].filter(Boolean).join(" ").trim() || "Driver";

      const driverSpecificDocs = perDriverExpiringMap.get(op.user_id) ?? [];
      const allExpiringDocs: ExpiringDoc[] = [...expiringCompanyDocs, ...driverSpecificDocs];

      if (allExpiringDocs.length === 0) continue;

      const mostUrgentDays = allExpiringDocs.reduce((min, d) => d.daysLeft < min ? d.daysLeft : min, THRESHOLD);
      const isCritical = mostUrgentDays <= 7;
      const urgencyIcon = mostUrgentDays <= 7 ? "🚨" : "⚠️";

      // ── Operator in-app notifications ─────────────────────────────────
      for (const doc of allExpiringDocs) {
        const alreadySent = await alreadyNotified(op.user_id, notifType, doc.name);
        if (alreadySent) continue;
        notificationsToInsert.push({
          user_id: op.user_id,
          title: doc.daysLeft <= 7
            ? `🚨 ${doc.name} Expiring in ${doc.daysLeft} Day${doc.daysLeft !== 1 ? "s" : ""}`
            : `⚠️ ${doc.name} Expiring in ${doc.daysLeft} Day${doc.daysLeft !== 1 ? "s" : ""}`,
          body: `Your ${doc.name} expires on ${doc.expiryStr}. Check your Inspection Binder to ensure compliance.`,
          type: notifType,
          channel: "in_app",
          link: "/operator?tab=inspection-binder",
        });
      }

      // ── Operator email ─────────────────────────────────────────────────
      if (RESEND_API_KEY) {
        const emailOk = await userEmailEnabled(op.user_id, "cert_expiry");
        if (emailOk) {
          const { data: authData } = await supabase.auth.admin.getUserById(op.user_id);
          const opEmail = authData?.user?.email;
          if (opEmail) {
            const docCount = allExpiringDocs.length;
            const docTable = buildDocTable(allExpiringDocs);
            const subject = isCritical
              ? urgencyIcon + " Action Required: Inspection Documents Expiring Soon"
              : urgencyIcon + " Reminder: " + docCount + " Inspection Document" + (docCount !== 1 ? "s" : "") + " Expiring Within 30 Days";
            const heading = isCritical
              ? urgencyIcon + " Inspection Documents Expiring Soon"
              : urgencyIcon + " Inspection Binder — Documents Expiring Within 30 Days";
            const howTo = `<p style="background:#fff8e6;border-left:4px solid #C9A84C;padding:12px 16px;border-radius:4px;margin-top:16px;">
              <strong>What to do:</strong> Log in to your portal and open the Inspection Binder tab. Contact your coordinator if you need assistance uploading renewed documents.
            </p>`;
            const body = "<p>Hi " + firstName + ",</p>" +
              "<p>The following documents in your Inspection Binder are expiring within 30 days. Expired documents can result in roadside violations — please act promptly.</p>" +
              docTable + howTo;
            const html = buildEmail(subject, heading, body, "Open Inspection Binder", appUrl + "/operator?tab=inspection-binder");
            await sendEmail(opEmail, subject, html, RESEND_API_KEY);
            emailsSent++;
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }

      // ── Assigned coordinator in-app notifications ──────────────────────
      if (op.assigned_onboarding_staff) {
        const staffId = op.assigned_onboarding_staff as string;

        for (const doc of allExpiringDocs) {
          // Check dedup against coordinator's notifications for this operator+doc
          const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", staffId)
            .eq("type", notifType)
            .ilike("body", "%" + operatorName + "%")
            .ilike("body", "%" + doc.name + "%")
            .is("read_at", null)
            .gte("sent_at", cutoff)
            .limit(1);
          if ((existing?.length ?? 0) > 0) continue;

          notificationsToInsert.push({
            user_id: staffId,
            title: doc.daysLeft <= 7
              ? "🚨 " + operatorName + " — " + doc.name + " Expiring in " + doc.daysLeft + " Day" + (doc.daysLeft !== 1 ? "s" : "")
              : "⚠️ " + operatorName + " — " + doc.name + " Expiring in " + doc.daysLeft + " Day" + (doc.daysLeft !== 1 ? "s" : ""),
            body: operatorName + "'s " + doc.name + " expires on " + doc.expiryStr + ". Follow up to ensure the document is renewed.",
            type: notifType,
            channel: "in_app",
            link: "/staff?operator=" + op.id,
          });
        }

        // ── Coordinator email ──────────────────────────────────────────────
        if (RESEND_API_KEY) {
          const emailOk = await userEmailEnabled(staffId, "cert_expiry");
          if (emailOk) {
            const { data: staffAuthData } = await supabase.auth.admin.getUserById(staffId);
            const staffEmail = staffAuthData?.user?.email;
            if (staffEmail) {
              const docTable = buildDocTable(allExpiringDocs);
              const subject = isCritical
                ? "🚨 Compliance Alert: " + operatorName + " — Inspection Documents Expiring"
                : "⚠️ Notice: " + operatorName + " — Inspection Documents Expiring Within 30 Days";
              const heading = isCritical
                ? "🚨 " + operatorName + "'s Inspection Documents — Expiring Soon"
                : "⚠️ " + operatorName + " — Inspection Binder Documents Expiring Within 30 Days";
              const followUpNote = isCritical
                ? "<p><strong>Urgent:</strong> Please contact <strong>" + operatorName + "</strong> immediately to ensure their documents are renewed before the deadline.</p>"
                : "<p>No immediate action needed — this is an advance notice. Consider reaching out to <strong>" + operatorName + "</strong> to confirm they are aware and planning ahead.</p>";
              const body = "<p>Hi,</p>" +
                "<p>The following inspection binder documents for your assigned operator <strong>" + operatorName + "</strong> are expiring within the next 30 days.</p>" +
                docTable + followUpNote;
              const html = buildEmail(subject, heading, body, "View Operator Panel", appUrl + "/staff?operator=" + op.id);
              await sendEmail(staffEmail, subject, html, RESEND_API_KEY);
              emailsSent++;
              await new Promise((r) => setTimeout(r, 600));
            }
          }
        }
      }
    }

    // ── Batch insert notifications ────────────────────────────────────────
    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("notifications").insert(notificationsToInsert);
      if (insertError) throw insertError;
    }

    console.log("check-inspection-expiry: inserted " + notificationsToInsert.length + " notifications, sent " + emailsSent + " emails");

    return new Response(
      JSON.stringify({ message: "Done", inserted: notificationsToInsert.length, emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-inspection-expiry error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
