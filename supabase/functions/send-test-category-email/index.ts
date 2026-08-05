import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { buildEmail, sendEmail, SUPPORT_EMAIL } from '../_shared/email-layout.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    const uid = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !uid) return json({ error: 'Unauthorized' }, 401);

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', uid)
      .in('role', ['owner', 'management'])
      .limit(1);
    if (!roles?.length) return json({ error: 'Owner or management access required' }, 403);

    const body = await req.json().catch(() => ({}));
    const category = typeof body?.category === 'string' ? body.category : '';
    const categoryLabel = typeof body?.category_label === 'string' ? body.category_label : category;
    if (!category) return json({ error: 'category is required' }, 400);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return json({ error: 'Email sending is not configured' }, 500);

    const { data: userRes } = await admin.auth.admin.getUserById(uid);
    const to = userRes?.user?.email;
    if (!to) return json({ error: 'No email address on your account' }, 400);

    const subject = `Test — ${categoryLabel} notifications`;
    const html = buildEmail(
      subject,
      `Test email — ${categoryLabel}`,
      `<p>This is a test of the <strong>${categoryLabel}</strong> email category.</p>
       <p>It was sent only to you from the Email Notification Settings screen. No other staff received it.</p>`,
      undefined,
      SUPPORT_EMAIL,
    );

    await sendEmail(to, subject, html, RESEND_API_KEY);
    return json({ success: true, sent_to: to });
  } catch (err) {
    console.error('[send-test-category-email]', err);
    return json({ error: String(err) }, 500);
  }
});
