import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HARDCODED_CC = ['marc@mysupertranport.com'];

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const dateStr = v.length === 10 ? `${v}T12:00:00` : v;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildHtml(d: {
  driverName: string;
  unit: string;
  vin: string;
  truckLabel: string;
  effectiveDate: string;
  leaseEffectiveDate: string;
  contractorLabel: string;
  carrierName: string;
  carrierTitle: string;
  notes: string | null;
  dlAttached: boolean;
  dlSignedUrl: string | null;
}): string {
  const dlSection = d.dlAttached
    ? `<p style="margin:16px 0 0;"><strong>Driver's License:</strong> <span style="color:#27ae60;">✓ Attached</span></p>`
    : d.dlSignedUrl
      ? `<p style="margin:16px 0 0;"><strong>Driver's License:</strong> <a href="${d.dlSignedUrl}" style="color:#C9A84C;font-weight:600;">View Driver's License</a> <em style="color:#999;font-size:12px;">(link expires in 7 days)</em></p>`
      : `<p style="margin:16px 0 0;color:#999;font-size:13px;"><em>No driver's license on file.</em></p>`;

  const notesSection = d.notes
    ? `<div style="margin-top:24px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;"><strong>Notes:</strong><br/>${d.notes}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Lease Termination — ${d.driverName}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader('LEASE TERMINATION NOTICE')}
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">Lease Termination — Appendix C</h1>
          <p style="margin:0 0 28px;color:#666;font-size:14px;">Please remove the unit and driver below from the active policy effective ${d.effectiveDate}.</p>

          <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Driver &amp; Unit</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Driver</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${d.driverName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Contractor</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${d.contractorLabel}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Unit Number</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${d.unit}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Equipment</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${d.truckLabel}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">VIN</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${d.vin}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;">Original ICA Effective</td><td style="padding:8px 12px;">${d.leaseEffectiveDate}</td></tr>
          </table>

          <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Termination</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Effective Termination Date</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#0f1117;">${d.effectiveDate}</td></tr>
            <tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;">Signed By (Carrier)</td><td style="padding:8px 12px;">${d.carrierName}, ${d.carrierTitle}</td></tr>
          </table>

          ${dlSection}
          ${notesSection}

          <p style="margin:28px 0 0;color:#666;font-size:13px;">Questions? Reply to this email or contact <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a></p>
        </td></tr>
        ${emailFooter('onboarding@mysupertransport.com', 'Termination notice issued by SUPERTRANSPORT carrier operations.')}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authErr } = await supabaseUser.auth.getClaims(token);
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const callerId = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Owner/management only
    const { data: callerRoles } = await supabase
      .from('user_roles').select('role').eq('user_id', callerId)
      .in('role', ['owner', 'management']).limit(1);
    if (!callerRoles?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { termination_id } = await req.json() as { termination_id: string };
    if (!termination_id) {
      return new Response(JSON.stringify({ error: 'termination_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load termination
    const { data: term, error: termErr } = await supabase
      .from('lease_terminations').select('*').eq('id', termination_id).maybeSingle();
    if (termErr || !term) {
      return new Response(JSON.stringify({ error: 'Termination not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load operator + driver name + DL paths + unit + caller profile + recipients
    const [opRes, settingsRes, callerProfRes, osRes] = await Promise.all([
      supabase.from('operators').select(`
        id, unit_number,
        applications (first_name, last_name, dl_front_url)
      `).eq('id', term.operator_id).maybeSingle(),
      supabase.from('insurance_email_settings').select('recipient_emails').eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle(),
      supabase.from('profiles').select('first_name, last_name').eq('user_id', callerId).maybeSingle(),
      supabase.from('onboarding_status').select('unit_number').eq('operator_id', term.operator_id).maybeSingle(),
    ]);

    if (!opRes.data) {
      return new Response(JSON.stringify({ error: 'Operator not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const op = opRes.data as any;
    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;

    const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || term.contractor_label || 'Driver';
    const unit = (osRes.data as any)?.unit_number ?? op.unit_number ?? '—';

    const recipients: string[] = settingsRes.data?.recipient_emails ?? [];
    if (!recipients.length) {
      return new Response(JSON.stringify({ error: 'No insurance recipients configured. Add them in Stage 6 Insurance Settings.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const callerName = callerProfRes.data
      ? [callerProfRes.data.first_name, callerProfRes.data.last_name].filter(Boolean).join(' ').trim()
      : 'Carrier';

    // --- Download DL ---
    let dlBase64: string | null = null;
    let dlSignedUrl: string | null = null;
    let dlFileName = 'drivers_license.jpg';
    let dlStoragePath: string | null = app?.dl_front_url ?? null;

    if (!dlStoragePath) {
      const { data: opDoc } = await supabase
        .from('operator_documents')
        .select('file_url, file_name')
        .eq('operator_id', term.operator_id)
        .eq('document_type', 'drivers_license')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (opDoc?.file_url) {
        dlStoragePath = opDoc.file_url;
        if (opDoc.file_name) dlFileName = opDoc.file_name;
      }
    }

    if (dlStoragePath) {
      try {
        let bucket = 'application-documents';
        let filePath = dlStoragePath;
        if (dlStoragePath.startsWith('operator-documents/') || dlStoragePath.includes('/operator-documents/')) {
          bucket = 'operator-documents';
          filePath = dlStoragePath.replace(/^.*?operator-documents\//, '');
        } else {
          filePath = dlStoragePath.replace(/^.*?application-documents\//, '');
        }
        const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(filePath);
        if (!dlErr && fileData) {
          const buf = await fileData.arrayBuffer();
          if (buf.byteLength > 4 * 1024 * 1024) {
            const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(filePath, 604800);
            dlSignedUrl = signed?.signedUrl ?? null;
          } else {
            dlBase64 = base64Encode(new Uint8Array(buf));
            const parts = filePath.split('/');
            const last = parts[parts.length - 1];
            if (last && app?.dl_front_url === dlStoragePath) dlFileName = last;
          }
        }
      } catch (e) {
        console.warn('DL download failed:', e);
      }
    }

    const truckLabel = [term.truck_year, term.truck_make, term.truck_model].filter(Boolean).join(' ') || '—';

    const html = buildHtml({
      driverName,
      unit,
      vin: term.truck_vin ?? '—',
      truckLabel,
      effectiveDate: fmtDate(term.effective_date),
      leaseEffectiveDate: fmtDate(term.lease_effective_date),
      contractorLabel: term.contractor_label ?? driverName,
      carrierName: term.carrier_typed_name ?? 'Carrier',
      carrierTitle: term.carrier_title ?? '',
      notes: term.notes,
      dlAttached: !!dlBase64,
      dlSignedUrl,
    });

    const subject = `Lease Termination Notice — ${driverName} — Unit ${unit}`;

    const emailPayload: Record<string, unknown> = {
      from: 'SUPERTRANSPORT Onboarding <onboarding@mysupertransport.com>',
      to: recipients,
      cc: HARDCODED_CC,
      subject,
      html,
    };
    if (dlBase64) {
      emailPayload.attachments = [{ filename: dlFileName, content: dlBase64 }];
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });

    let emailError: string | null = null;
    if (!res.ok) {
      emailError = `Resend error [${res.status}]: ${await res.text()}`;
      console.error('send-lease-termination email error:', emailError);
    } else {
      await supabase.from('lease_terminations').update({
        insurance_notified_at: new Date().toISOString(),
        insurance_recipients: recipients,
      }).eq('id', termination_id);
    }

    await supabase.from('audit_log').insert({
      actor_id: callerId,
      actor_name: callerName,
      entity_type: 'operator',
      entity_id: term.operator_id,
      entity_label: driverName,
      action: 'lease_termination_sent',
      metadata: {
        termination_id,
        recipients,
        cc: HARDCODED_CC,
        effective_date: term.effective_date,
        vin: term.truck_vin,
        reason: term.reason,
        email_error: emailError,
      },
    });

    if (emailError) {
      return new Response(JSON.stringify({ success: false, error: emailError }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipients, cc: HARDCODED_CC }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('send-lease-termination error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});