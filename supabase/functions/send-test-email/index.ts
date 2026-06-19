import { buildEmail, sendEmailStrict } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const appUrl = 'https://mysupertransport.lovable.app';
    const to = 'emma@mysupertransport.com';
    const name = 'Emma Mueller';

    const subject = 'Action Required: Download Your QPassport';
    const heading = '📋 Your QPassport is Ready';
    const body = `<p>Hi ${name},</p>
      <p>Your <strong>QPassport</strong> has been uploaded by your onboarding coordinator and is now available for download in your portal.</p>
      <p><strong>Important:</strong> You must bring this document to your drug screening appointment. The facility will scan the barcode to verify your identity before the test.</p>
      <p>Please log in to your portal, open the <strong>Stage 1 — Background Check</strong> section, and download your QPassport now.</p>
      <p>If you have any questions, contact us at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`;
    const cta = { label: 'Download My QPassport', url: `${appUrl}/operator?tab=progress&action=download-qpassport#qpassport` };

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