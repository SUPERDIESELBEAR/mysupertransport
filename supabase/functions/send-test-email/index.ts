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

    const to = 'emma@mysupertransport.com';
    const name = 'Emma Mueller';

    // Mint a real download token using any operator that has a QPassport on
    // file. The test email is sent to Emma to verify the click-through; the
    // file behind the link is whatever QPassport is most recently uploaded.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: qpRow } = await admin
      .from('onboarding_status')
      .select('operator_id')
      .not('qpassport_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const operatorId = (qpRow as { operator_id?: string } | null)?.operator_id;
    const downloadUrl = operatorId
      ? await buildQPassportDownloadUrl(operatorId)
      : 'https://mysupertransport.lovable.app/operator?tab=progress#qpassport';

    const subject = 'Action Required: Download Your QPassport';
    const heading = '📋 Your QPassport is Ready';
    const body = `<p>Hi ${name},</p>
      <p>Your <strong>QPassport</strong> has been uploaded by your onboarding coordinator and is now available for download in your portal.</p>
      <p><strong>Important:</strong> You must bring this document to your drug screening appointment. The facility will scan the barcode to verify your identity before the test.</p>
      <p>Please log in to your portal, open the <strong>Stage 1 — Background Check</strong> section, and download your QPassport now.</p>
      <p>If you have any questions, contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`;
    const cta = { label: 'Download My QPassport', url: downloadUrl };

    const html = buildEmail(subject, heading, body, cta);
    await sendEmailStrict(to, subject, html, RESEND_API_KEY);

    return new Response(JSON.stringify({ ok: true, to }), {
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