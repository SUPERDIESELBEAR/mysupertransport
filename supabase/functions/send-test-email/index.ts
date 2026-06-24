import { buildEmail, sendEmailStrict } from '../_shared/email-layout.ts';
import { buildQPassportDownloadUrl } from '../_shared/qpassport-link.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    // Optional body: { operator_email?: string, to?: string }
    let body: { operator_email?: string; to?: string } = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { /* allow empty body */ }
    }
    const to = (body.to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to))
      ? body.to
      : 'emma@mysupertransport.com';
    const name = 'Emma Mueller';

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Resolve which operator's QPassport this email should link to.
    // If operator_email is provided, look up that specific operator and
    // require they have a QPassport on file. Otherwise fall back to the
    // most recently uploaded QPassport across all operators.
    let operatorId: string | undefined;
    if (body.operator_email) {
      const { data: userRow, error: userErr } = await admin
        .schema('auth').from('users')
        .select('id')
        .eq('email', body.operator_email)
        .maybeSingle();
      if (userErr || !userRow) {
        return new Response(JSON.stringify({ error: `No auth user found for ${body.operator_email}` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: opRow } = await admin
        .from('operators').select('id').eq('user_id', (userRow as { id: string }).id).maybeSingle();
      if (!opRow) {
        return new Response(JSON.stringify({ error: `No operator record for ${body.operator_email}` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const opId = (opRow as { id: string }).id;
      const { data: osRow } = await admin
        .from('onboarding_status').select('qpassport_url').eq('operator_id', opId).maybeSingle();
      if (!osRow || !(osRow as { qpassport_url?: string | null }).qpassport_url) {
        return new Response(JSON.stringify({ error: `Operator ${body.operator_email} has no QPassport on file` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      operatorId = opId;
    } else {
      const { data: qpRow } = await admin
        .from('onboarding_status')
        .select('operator_id')
        .not('qpassport_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      operatorId = (qpRow as { operator_id?: string } | null)?.operator_id;
    }
    const downloadUrl = operatorId
      ? await buildQPassportDownloadUrl(operatorId)
      : 'https://mysupertransport.lovable.app/operator?tab=progress#qpassport';

    const subject = 'Action Required: Download Your QPassport';
    const heading = '📋 Your QPassport is Ready';
    const html_body = `<p>Hi ${name},</p>
      <p>Your <strong>QPassport</strong> has been uploaded by your onboarding coordinator and is now available to open and download.</p>
      <p><strong>Important:</strong> You must bring this document to your drug screening appointment. The facility will scan the barcode to verify your identity before the test.</p>
      <p>Click the button below to open your QPassport in your browser. A copy will also download automatically so you can bring it to your drug screening appointment.</p>
      <p>If you have any questions, contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`;
    const cta = { label: 'Open QPassport', url: downloadUrl };

    const html = buildEmail(subject, heading, html_body, cta);
    await sendEmailStrict(to, subject, html, RESEND_API_KEY);

    return new Response(JSON.stringify({ ok: true, to, operator_id: operatorId ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});