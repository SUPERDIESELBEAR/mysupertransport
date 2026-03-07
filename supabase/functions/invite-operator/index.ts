import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the caller is authenticated and is management/staff
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

    // Check caller is staff
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

    // Fetch the application
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

    // Send invite email via Supabase Auth admin invite
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      app.email,
      {
        data: {
          first_name: app.first_name ?? '',
          last_name: app.last_name ?? '',
          invited_as: 'operator',
        },
        redirectTo: `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '') ?? ''}/dashboard`,
      }
    );

    if (inviteError) {
      // User may already exist — try to look them up and just create operator record
      console.error('Invite error (may already exist):', inviteError.message);
    }

    // Get the invited user's id
    let invitedUserId: string | null = null;
    if (inviteData?.user) {
      invitedUserId = inviteData.user.id;
    } else {
      // Try to find existing user by email
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users?.find(u => u.email === app.email);
      if (existing) invitedUserId = existing.id;
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id for invite' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update application with the user_id
    await supabaseAdmin
      .from('applications')
      .update({ user_id: invitedUserId })
      .eq('id', application_id);

    // Assign 'operator' role (idempotent upsert)
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: invitedUserId, role: 'operator' }, { onConflict: 'user_id,role' });

    // Create operator record if not already exists
    const { data: existingOp } = await supabaseAdmin
      .from('operators')
      .select('id')
      .eq('user_id', invitedUserId)
      .maybeSingle();

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
        // Seed onboarding_status record
        await supabaseAdmin
          .from('onboarding_status')
          .insert({ operator_id: newOp.id });
      }
    }

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
