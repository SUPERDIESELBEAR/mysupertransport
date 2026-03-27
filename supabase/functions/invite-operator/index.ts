import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .in('role', ['management', 'onboarding_staff'])
      .limit(1);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { application_id, reviewer_notes, skip_invite } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !app) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (app.review_status !== 'pending' && app.review_status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Application is not in pending or approved status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update application to approved
    const { error: updateAppError } = await supabaseAdmin
      .from('applications')
      .update({
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: callerUser.id,
        reviewer_notes: reviewer_notes ?? null,
        is_draft: false,
      })
      .eq('id', application_id);

    if (updateAppError) {
      return new Response(JSON.stringify({ error: updateAppError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create or find the auth user
    let invitedUserId: string | null = null;

    if (skip_invite) {
      // For pre-existing operators: check if auth user exists, create without invite if not
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === app.email);
      if (existing) {
        invitedUserId = existing.id;
      } else {
        // Create user with a random password (they can reset later)
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: app.email,
          email_confirm: true,
          user_metadata: {
            first_name: app.first_name ?? '',
            last_name: app.last_name ?? '',
            invited_as: 'operator',
          },
        });
        if (createErr) console.error('Create user error:', createErr.message);
        if (newUser?.user) invitedUserId = newUser.user.id;
      }
    } else {
      // Standard flow: send Supabase auth invite email
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        app.email,
        {
          data: {
            first_name: app.first_name ?? '',
            last_name: app.last_name ?? '',
            invited_as: 'operator',
          },
          redirectTo: `${Deno.env.get('APP_URL') ?? 'https://mysupertransport.com'}/welcome`,
        }
      );

      if (inviteError) {
        console.error('Invite error (may already exist):', inviteError.message);
      }

      if (inviteData?.user) {
        invitedUserId = inviteData.user.id;
      } else {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = users?.find(u => u.email === app.email);
        if (existing) invitedUserId = existing.id;
      }
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id for invite' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabaseAdmin.from('applications').update({ user_id: invitedUserId }).eq('id', application_id);
    await supabaseAdmin.from('user_roles').upsert({ user_id: invitedUserId, role: 'operator' }, { onConflict: 'user_id,role' });

    const { data: existingOp } = await supabaseAdmin.from('operators').select('id').eq('user_id', invitedUserId).maybeSingle();

    let operatorId: string | null = existingOp?.id ?? null;

    if (!existingOp) {
      const { data: newOp, error: opError } = await supabaseAdmin
        .from('operators')
        .insert({
          user_id: invitedUserId,
          application_id: application_id,
          assigned_onboarding_staff: callerUser.id,
        })
        .select('id')
        .single();

      if (opError) {
        console.error('Operator create error:', opError.message);
      } else if (newOp) {
        operatorId = newOp.id;
        await supabaseAdmin.from('onboarding_status').insert({ operator_id: newOp.id });
      }
    }

    // ── Resolve actor name & applicant name (shared by audit + notifs) ──
    const callerProfile = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerUser.id)
      .maybeSingle();
    const actorName = callerProfile.data
      ? `${callerProfile.data.first_name ?? ''} ${callerProfile.data.last_name ?? ''}`.trim() || callerUser.email
      : callerUser.email;
    const applicantName = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.email;

    // ── In-app notifications → management users who want them ─────────
    const { data: mgmtRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'management');

    if (mgmtRoles && mgmtRoles.length > 0 && operatorId) {
      const notifLink = `/staff?operator=${operatorId}`;

      // Filter to users with in_app enabled (default = enabled if no row)
      const { data: optedOut } = await supabaseAdmin
        .from('notification_preferences')
        .select('user_id')
        .in('user_id', mgmtRoles.map(r => r.user_id))
        .eq('event_type', 'application_approved')
        .eq('in_app_enabled', false);
      const optedOutIds = new Set((optedOut ?? []).map(r => r.user_id));

      const notifRows = mgmtRoles
        .filter(({ user_id }) => !optedOutIds.has(user_id))
        .map(({ user_id }) => ({
          user_id,
          title: 'Application Approved',
          body: `${applicantName} has been approved and invited as an Operator.`,
          type: 'application_approved',
          channel: 'in_app' as const,
          link: notifLink,
        }));
      if (notifRows.length > 0) {
        supabaseAdmin.from('notifications').insert(notifRows)
          .then(({ error }) => { if (error) console.error('Mgmt notification error:', error.message); });
      }
    }

    // ── Audit log ──────────────────────────────────────────────────────
    // Write both audit entries in parallel (fire-and-forget)
    Promise.all([
      supabaseAdmin.from('audit_log').insert({
        actor_id: callerUser.id,
        actor_name: actorName,
        action: 'application_approved',
        entity_type: 'application',
        entity_id: application_id,
        entity_label: applicantName,
        metadata: { applicant_email: app.email, reviewer_notes: reviewer_notes ?? null },
      }),
      supabaseAdmin.from('audit_log').insert({
        actor_id: callerUser.id,
        actor_name: actorName,
        action: 'operator_invited',
        entity_type: 'operator',
        entity_id: invitedUserId,
        entity_label: applicantName,
        metadata: {
          email: app.email,
          application_id,
          first_name: app.first_name ?? null,
          last_name: app.last_name ?? null,
          reviewer_notes: reviewer_notes ?? null,
        },
      }),
    ]).catch(e => console.error('Audit log error:', e));

    // Fire approval notification email (fire-and-forget)
    const notifUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`;
    fetch(notifUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        type: 'application_approved',
        applicant_name: applicantName,
        applicant_email: app.email,
        reviewer_notes: reviewer_notes ?? null,
      }),
    }).catch(e => console.error('Notification fire-and-forget error:', e));

    return new Response(JSON.stringify({ success: true, user_id: invitedUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
