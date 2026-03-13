import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return json({ error: 'email is required' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Confirm the application exists, is approved, and email matches
    const { data: app, error: appError } = await supabaseAdmin
      .from('applications')
      .select('id, email, first_name, last_name, review_status, user_id')
      .ilike('email', normalizedEmail)
      .eq('review_status', 'approved')
      .maybeSingle();

    if (appError || !app) {
      // Return a generic message to avoid email enumeration
      return json({ success: true });
    }

    // 2. Check if the operator has already activated their account (has a confirmed session).
    //    If last_sign_in_at is set they have logged in — no need to resend.
    if (app.user_id) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.id === app.user_id);
      if (existing?.last_sign_in_at) {
        // Account already active — return generic success to avoid enumeration
        return json({ success: true });
      }
    }

    // 3. Rate-limit: only 1 resend per 5 minutes per email (checked via audit_log)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentResend } = await supabaseAdmin
      .from('audit_log')
      .select('id')
      .eq('action', 'invite_resent')
      .eq('entity_label', normalizedEmail)
      .gte('created_at', fiveMinutesAgo)
      .maybeSingle();

    if (recentResend) {
      return json({ error: 'Please wait a few minutes before requesting another invitation.' }, 429);
    }

    // 4. Re-send the invite
    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.com';
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: {
          first_name: app.first_name ?? '',
          last_name: app.last_name ?? '',
          invited_as: 'operator',
        },
        redirectTo: `${appUrl}/welcome`,
      }
    );

    if (inviteError) {
      console.error('Resend invite error:', inviteError.message);
      return json({ error: 'Failed to send invitation. Please try again.' }, 500);
    }

    // 5. Audit log the resend (used for rate-limiting above)
    await supabaseAdmin.from('audit_log').insert({
      action: 'invite_resent',
      entity_type: 'operator',
      entity_label: normalizedEmail,
      metadata: { application_id: app.id },
    });

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
