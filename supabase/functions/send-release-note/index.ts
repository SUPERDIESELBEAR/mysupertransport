import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, SUPPORT_EMAIL } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, body } = await req.json();
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.warn('RESEND_API_KEY not set — skipping emails');
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all staff user IDs
    const { data: staffRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('role', ['onboarding_staff', 'dispatcher', 'management', 'owner']);

    if (!staffRoles?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uniqueUserIds = [...new Set(staffRoles.map((r) => r.user_id))];

    // Check email preferences
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, email_enabled')
      .eq('event_type', 'release_note')
      .in('user_id', uniqueUserIds);

    const disabledSet = new Set(
      (prefs ?? []).filter((p) => !p.email_enabled).map((p) => p.user_id)
    );

    const eligibleIds = uniqueUserIds.filter((id) => !disabledSet.has(id));

    // Get emails from auth
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of usersData?.users ?? []) {
      if (u.email) emailMap.set(u.id, u.email);
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';

    const emailHtml = buildEmail(
      `🆕 ${title}`,
      `🆕 ${title}`,
      `<div style="color:#444;font-size:15px;line-height:1.7;">${body.replace(/\n/g, '<br/>')}</div>`,
      { label: 'View in Portal', url: `${appUrl}/management?view=whats-new` },
      SUPPORT_EMAIL
    );

    let sent = 0;
    for (const uid of eligibleIds) {
      const email = emailMap.get(uid);
      if (!email) continue;
      await sendEmail(email, `🆕 ${title}`, emailHtml, resendKey);
      sent++;
      // Rate limit: 600ms between emails
      if (sent < eligibleIds.length) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-release-note error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
