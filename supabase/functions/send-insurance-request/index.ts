import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailHeader, emailFooter } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddressBlock {
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
}

function formatAddressBlock(block: AddressBlock): string {
  const lines: string[] = [];
  if (block.company) lines.push(`<strong>${block.company}</strong>`);
  if (block.address) lines.push(block.address);
  const cityLine = [block.city, block.state, block.zip].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (block.email) lines.push(`<a href="mailto:${block.email}" style="color:#C9A84C;">${block.email}</a> <em style="color:#999;font-size:12px;">(cert copy)</em>`);
  return lines.length ? lines.join('<br/>') : '<em style="color:#999;">Not provided</em>';
}

function buildInsuranceEmail(data: {
  driverName: string;
  dlUrl: string | null;
  yearsExperience: string | null;
  vin: string | null;
  truckYear: string | null;
  truckMake: string | null;
  policyType: string;
  statedValue: number | null;
  ai: AddressBlock;
  ch: AddressBlock;
  operatorEmail: string;
  notes: string | null;
}): string {
  const addToPolicy = data.policyType === 'add_to_supertransport';

  const statedValueRow = addToPolicy && data.statedValue
    ? `<tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Stated Value</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">$${data.statedValue.toLocaleString()}</td></tr>`
    : '';

  const aiHasData = Object.values(data.ai).some(v => v);
  const chHasData = Object.values(data.ch).some(v => v);

  const addlInsuredRow = aiHasData
    ? `<tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;vertical-align:top;">Additional Insured</td><td style="padding:8px 12px;border-bottom:1px solid #eee;line-height:1.6;">${formatAddressBlock(data.ai)}</td></tr>`
    : '';

  const certHolderRow = chHasData
    ? `<tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;vertical-align:top;">Certificate Holder</td><td style="padding:8px 12px;border-bottom:1px solid #eee;line-height:1.6;">${formatAddressBlock(data.ch)}</td></tr>`
    : '';

  const dlSection = data.dlUrl
    ? `<p style="margin:16px 0 4px;"><strong>Driver's License:</strong></p>
       <p style="margin:0;"><a href="${data.dlUrl}" style="color:#C9A84C;">View Driver's License Copy</a></p>`
    : '<p style="margin:16px 0 0;color:#999;font-size:13px;"><em>No driver\'s license on file.</em></p>';

  const notesSection = data.notes
    ? `<div style="margin-top:24px;padding:12px 16px;background:#f9f8f4;border-left:4px solid #C9A84C;border-radius:4px;">
        <strong>Additional Notes:</strong><br/>${data.notes}
       </div>`
    : '';

  const policyLabel = addToPolicy ? 'Add to SUPERTRANSPORT Policy' : 'Owner-Operator Has Own Policy';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Insurance Request — ${data.driverName}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader('INSURANCE REQUEST')}
        <tr>
          <td style="padding:36px 40px;">
            <h1 style="margin:0 0 6px;font-size:20px;color:#0f1117;font-weight:700;">New Physical Damage Insurance Request</h1>
            <p style="margin:0 0 28px;color:#666;font-size:14px;">Please process the following coverage request for a new owner-operator.</p>

            <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Coverage Request</p>
            <div style="display:inline-block;padding:6px 14px;background:${addToPolicy ? '#fff8e6' : '#eaf7f0'};border:1px solid ${addToPolicy ? '#C9A84C' : '#27ae60'};border-radius:6px;font-size:13px;font-weight:600;color:${addToPolicy ? '#C9A84C' : '#27ae60'};margin-bottom:24px;">
              ${policyLabel}
            </div>

            <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Driver Information</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
              <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">Driver Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.driverName}</td></tr>
              <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.operatorEmail}</td></tr>
              <tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:600;">CMV Experience</td><td style="padding:8px 12px;">${data.yearsExperience ?? 'N/A'}</td></tr>
            </table>

            <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Vehicle Information</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
              <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;width:40%;">VIN</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;">${data.vin ?? 'N/A'}</td></tr>
              <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Year</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.truckYear ?? 'N/A'}</td></tr>
              <tr><td style="padding:8px 12px;background:#f9f9f9;border-bottom:1px solid #eee;font-weight:600;">Make</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.truckMake ?? 'N/A'}</td></tr>
              ${statedValueRow}
              ${addlInsuredRow}
              ${certHolderRow}
            </table>

            ${dlSection}
            ${notesSection}

            <p style="margin:28px 0 0;color:#666;font-size:13px;">Questions? Reply to this email or contact <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a></p>
          </td>
        </tr>
        ${emailFooter('onboarding@mysupertransport.com', 'This is a business request sent by your onboarding team.')}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: callerRoles } = await supabase
      .from('user_roles').select('role').eq('user_id', caller.id)
      .in('role', ['onboarding_staff', 'dispatcher', 'management']);
    if (!callerRoles?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { operator_id } = await req.json() as { operator_id: string };
    if (!operator_id) return new Response(JSON.stringify({ error: 'operator_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Fetch all needed data in parallel
    const [opResult, settingsResult, callerProfileResult] = await Promise.all([
      supabase.from('operators').select(`
        id, user_id,
        applications (first_name, last_name, years_experience, dl_front_url),
        ica_contracts (truck_vin, truck_year, truck_make)
      `).eq('id', operator_id).single(),
      supabase.from('insurance_email_settings').select('recipient_emails').eq('id', '00000000-0000-0000-0000-000000000001').single(),
      supabase.from('profiles').select('first_name, last_name').eq('user_id', caller.id).maybeSingle(),
    ]);

    if (opResult.error || !opResult.data) {
      return new Response(JSON.stringify({ error: 'Operator not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const op = opResult.data;
    const app = Array.isArray(op.applications) ? op.applications[0] : op.applications;
    const ica = Array.isArray(op.ica_contracts) ? op.ica_contracts[0] : op.ica_contracts;

    // Fetch onboarding_status for insurance fields
    const { data: os } = await supabase.from('onboarding_status').select(
      'insurance_policy_type, insurance_stated_value, insurance_notes, ' +
      'insurance_ai_company, insurance_ai_address, insurance_ai_city, insurance_ai_state, insurance_ai_zip, insurance_ai_email, ' +
      'insurance_ch_company, insurance_ch_address, insurance_ch_city, insurance_ch_state, insurance_ch_zip, insurance_ch_email'
    ).eq('operator_id', operator_id).single();

    // Get operator email
    const { data: { user: opUser } } = await supabase.auth.admin.getUserById(op.user_id);

    const driverName = [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'Driver';
    const callerName = callerProfileResult.data
      ? [callerProfileResult.data.first_name, callerProfileResult.data.last_name].filter(Boolean).join(' ').trim() || caller.email
      : caller.email;

    const recipients: string[] = settingsResult.data?.recipient_emails ?? [];
    if (!recipients.length) {
      return new Response(JSON.stringify({ error: 'No insurance email recipients configured. Please add recipients in Stage 6.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const policyType = os?.insurance_policy_type ?? 'add_to_supertransport';

    const ai: AddressBlock = {
      company: os?.insurance_ai_company ?? null,
      address: os?.insurance_ai_address ?? null,
      city:    os?.insurance_ai_city    ?? null,
      state:   os?.insurance_ai_state   ?? null,
      zip:     os?.insurance_ai_zip     ?? null,
      email:   os?.insurance_ai_email   ?? null,
    };
    const ch: AddressBlock = {
      company: os?.insurance_ch_company ?? null,
      address: os?.insurance_ch_address ?? null,
      city:    os?.insurance_ch_city    ?? null,
      state:   os?.insurance_ch_state   ?? null,
      zip:     os?.insurance_ch_zip     ?? null,
      email:   os?.insurance_ch_email   ?? null,
    };

    const html = buildInsuranceEmail({
      driverName,
      dlUrl: app?.dl_front_url ?? null,
      yearsExperience: app?.years_experience ?? null,
      vin: ica?.truck_vin ?? null,
      truckYear: ica?.truck_year ?? null,
      truckMake: ica?.truck_make ?? null,
      policyType,
      statedValue: os?.insurance_stated_value ?? null,
      ai,
      ch,
      operatorEmail: opUser?.email ?? '',
      notes: os?.insurance_notes ?? null,
    });

    const subject = `Physical Damage Insurance Request — ${driverName}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SUPERTRANSPORT Onboarding <onboarding@mysupertransport.com>',
        to: recipients,
        subject,
        html,
      }),
    });

    let emailError: string | null = null;
    if (!res.ok) {
      emailError = `Resend error [${res.status}]: ${await res.text()}`;
      console.error('send-insurance-request email error:', emailError);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_id: caller.id,
      actor_name: callerName,
      entity_type: 'operator',
      entity_id: operator_id,
      entity_label: driverName,
      action: 'insurance_request_sent',
      metadata: { recipients, policy_type: policyType, email_error: emailError },
    });

    if (emailError) {
      return new Response(JSON.stringify({ success: false, error: emailError }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipients }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('send-insurance-request error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
