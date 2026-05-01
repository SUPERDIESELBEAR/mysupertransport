import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail } from '../_shared/email-layout.ts';

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

    // 1. Find the application — staff can resend to any operator with an application,
    //    public flow only works for approved applicants who haven't signed in yet.
    let appQuery = supabaseAdmin
      .from('applications')
      .select('id, email, first_name, last_name, review_status, user_id')
      .ilike('email', normalizedEmail);

    // Staff can resend to operators regardless of review status
    if (!callerIsStaff) {
      appQuery = appQuery.eq('review_status', 'approved');
    }

    const { data: app, error: appError } = await appQuery.maybeSingle();

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

    // 4. Resolve the auth user's actual email (may differ from application email
    //    for operators added via "Add Driver").
    let targetEmail = normalizedEmail;
    if (app.user_id) {
      try {
        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(app.user_id);
        if (!authErr && authUser?.user?.email) {
          targetEmail = authUser.user.email.toLowerCase();
        }
      } catch (e) {
        console.error('Auth user lookup failed, falling back to app email:', e);
      }
    }

    // Re-send the invite.
    // For already-registered users (who haven't set a password yet),
    // generateLink(recovery) produces a "set password" link — functionally
    // identical to the original invite for the operator.
    const appUrl = Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: targetEmail,
      options: {
        redirectTo: `${appUrl}/welcome`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Resend invite error:', linkError?.message ?? 'No link generated');
      return json({ error: 'Failed to send invitation. Please try again.' }, 500);
    }

    const inviteLink = linkData.properties.action_link;
    const firstName = app.first_name ?? 'there';

    // 5. Audit log the resend (do this before email so it's always recorded)
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

    // 6. Send the invite email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      // Link was generated and audit logged — return success even if email fails
      return json({ success: true });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SUPERTRANSPORT <onboarding@mysupertransport.com>',
        to: normalizedEmail || targetEmail,
        subject: 'Your Invitation to SUPERTRANSPORT — Action Required',
        html: buildEmail(
          'Your Invitation to SUPERTRANSPORT — Action Required',
          `Welcome aboard, ${firstName}!`,
          `<p>You've been invited to join the <strong>SUPERTRANSPORT</strong> operator portal.</p>
           <p>If you tried a previous link and ran into trouble — we've upgraded the install experience.
           Please use this fresh link to set your password and install the app. Any earlier links can be discarded.</p>
           <p>Click the button below to set your password and get started:</p>`,
          { label: 'Accept Invitation', url: inviteLink },
          'onboarding@mysupertransport.com'
        ) + '',
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Resend email error:', errText);
      // Audit log is already written; return success so staff gets feedback
      return json({ success: true, warning: 'Invite link generated but email delivery failed.' });
    }

    return json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
