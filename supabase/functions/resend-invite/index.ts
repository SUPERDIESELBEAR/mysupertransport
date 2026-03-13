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
    const body = await req.json();
    const { email, staff_override } = body;
    if (!email || typeof email !== 'string') {
      return json({ error: 'email is required' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // If staff_override is set, verify the caller is an authenticated staff member
    let callerIsStaff = false;
    let callerName: string | null = null;
    if (staff_override) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const supabaseUser = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData } = await supabaseUser.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          const { data: isStaff } = await supabaseAdmin.rpc('is_staff', { _user_id: claimsData.claims.sub });
          if (isStaff) {
            callerIsStaff = true;
            // Resolve name for audit log
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('first_name, last_name')
              .eq('user_id', claimsData.claims.sub)
              .maybeSingle();
            if (profile) {
              callerName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null;
            }
          }
        }
      }
      if (!callerIsStaff) {
        return json({ error: 'Unauthorized' }, 403);
      }
    }

    // 1. Find the application — staff can resend to any approved operator,
    //    public flow only works for approved applicants who haven't signed in yet.
    const { data: app, error: appError } = await supabaseAdmin
      .from('applications')
      .select('id, email, first_name, last_name, review_status, user_id')
      .ilike('email', normalizedEmail)
      .eq('review_status', 'approved')
      .maybeSingle();

    if (appError || !app) {
      if (callerIsStaff) {
        return json({ error: 'No approved application found for this email.' }, 404);
      }
      // Public flow: generic message to avoid enumeration
      return json({ success: true });
    }

    // 2. For the public (operator self-service) flow: block if already signed in
    if (!callerIsStaff && app.user_id) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find((u: any) => u.id === app.user_id);
      if (existing?.last_sign_in_at) {
        return json({ success: true });
      }
    }

    // 3. Rate-limit: 1 resend per 5 minutes per email (staff bypasses this)
    if (!callerIsStaff) {
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

    // 5. Audit log the resend
    await supabaseAdmin.from('audit_log').insert({
      action: 'invite_resent',
      actor_name: callerName,
      entity_type: 'operator',
      entity_label: normalizedEmail,
      metadata: {
        application_id: app.id,
        triggered_by: callerIsStaff ? 'staff' : 'operator_self_service',
      },
    });

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
