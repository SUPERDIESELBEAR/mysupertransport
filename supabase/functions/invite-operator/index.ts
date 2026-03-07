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
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { application_id, reviewer_notes } = await req.json();
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

    if (app.review_status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Application is not in pending status' }), {
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

    // Send Supabase auth invite
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      app.email,
      {
        data: {
          first_name: app.first_name ?? '',
          last_name: app.last_name ?? '',
          invited_as: 'operator',
        },
        redirectTo: 'https://id-preview--ab645bc4-83af-495c-aca5-d40c7ca0fb70.lovable.app/dashboard',
      }
    );

    if (inviteError) {
      console.error('Invite error (may already exist):', inviteError.message);
    }

    // Resolve invited user id
    let invitedUserId: string | null = null;
    if (inviteData?.user) {
      invitedUserId = inviteData.user.id;
    } else {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === app.email);
      if (existing) invitedUserId = existing.id;
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id for invite' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabaseAdmin.from('applications').update({ user_id: invitedUserId }).eq('id', application_id);
    await supabaseAdmin.from('user_roles').upsert({ user_id: invitedUserId, role: 'operator' }, { onConflict: 'user_id,role' });

    const { data: existingOp } = await supabaseAdmin.from('operators').select('id').eq('user_id', invitedUserId).maybeSingle();

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
        await supabaseAdmin.from('onboarding_status').insert({ operator_id: newOp.id });
      }
    }

    // Fire approval notification email (fire-and-forget)
    const notifUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`;
    fetch(notifUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        type: 'application_approved',
        applicant_name: `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.email,
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
