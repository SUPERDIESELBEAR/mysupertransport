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
    // Verify caller identity
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller has owner role
    const { data: ownerCheck } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', callerId)
      .eq('role', 'owner')
      .limit(1);

    if (!ownerCheck || ownerCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Only the owner can delete accounts' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== 'string') {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-deletion
    if (user_id === callerId) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user info for audit log
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', user_id)
      .single();

    const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(user_id);
    const targetEmail = targetAuth?.user?.email ?? 'unknown';
    const targetName = targetProfile
      ? [targetProfile.first_name, targetProfile.last_name].filter(Boolean).join(' ') || targetEmail
      : targetEmail;

    // Get caller info for audit log
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerId)
      .single();
    const callerName = callerProfile
      ? [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ') || 'Owner'
      : 'Owner';

    // Clean up related data
    await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id);
    await supabaseAdmin.from('notification_preferences').delete().eq('user_id', user_id);
    await supabaseAdmin.from('notifications').delete().eq('user_id', user_id);
    await supabaseAdmin.from('messages').delete().or(`sender_id.eq.${user_id},recipient_id.eq.${user_id}`);
    await supabaseAdmin.from('document_acknowledgments').delete().eq('user_id', user_id);
    await supabaseAdmin.from('service_resource_bookmarks').delete().eq('user_id', user_id);
    await supabaseAdmin.from('service_resource_completions').delete().eq('user_id', user_id);
    await supabaseAdmin.from('service_resource_views').delete().eq('user_id', user_id);
    await supabaseAdmin.from('service_help_requests').delete().eq('user_id', user_id);

    // Clean up operator-related data if they were an operator
    const { data: opData } = await supabaseAdmin
      .from('operators')
      .select('id')
      .eq('user_id', user_id);

    if (opData && opData.length > 0) {
      for (const op of opData) {
        await supabaseAdmin.from('active_dispatch').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('dispatch_status_history').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('onboarding_status').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('operator_documents').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('documents').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('ica_contracts').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('cert_reminders').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('equipment_assignments').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('contractor_pay_setup').delete().eq('operator_id', op.id);
        await supabaseAdmin.from('pandadoc_documents').delete().eq('operator_id', op.id);
      }
      await supabaseAdmin.from('operators').delete().eq('user_id', user_id);
    }

    // Delete driver uploads
    await supabaseAdmin.from('driver_uploads').delete().eq('driver_id', user_id);
    // Delete inspection docs uploaded by this user
    await supabaseAdmin.from('inspection_documents').delete().eq('driver_id', user_id);

    // Delete profile
    await supabaseAdmin.from('profiles').delete().eq('user_id', user_id);

    // Delete auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      actor_id: callerId,
      actor_name: callerName,
      action: 'delete_account',
      entity_type: 'user',
      entity_id: user_id,
      entity_label: targetName,
      metadata: { email: targetEmail, deleted_by: 'owner' },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
