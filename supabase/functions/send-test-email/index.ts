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

    const subject = 'Drug Screening Scheduled — SUPERTRANSPORT';
    const heading = '🔬 Drug Screening Scheduled';
    const body = `<p>Hi ${name},</p>
      <p>Your <strong>pre-employment drug screening</strong> has been scheduled.</p>
      <p>You should receive a separate email with the clinic location and instructions. Please complete your screening as soon as possible to keep your onboarding on track.</p>
      <p>If you have any questions, contact your coordinator at <a href="mailto:onboarding@mysupertransport.com" style="color:#C9A84C;">onboarding@mysupertransport.com</a>.</p>`;
    const cta = { label: 'View My Portal', url: `${appUrl}/dashboard?tab=progress` };

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