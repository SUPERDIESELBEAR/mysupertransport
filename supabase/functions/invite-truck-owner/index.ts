import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
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
      .in('role', ['management', 'onboarding_staff', 'owner'])
      .limit(1);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: staff only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      operator_id,
      legal_first_name,
      legal_last_name,
      business_name,
      email,
      phone,
      address_street,
      address_city,
      address_state,
      address_zip,
      send_invite = true,
    } = body ?? {};

    if (!operator_id || !legal_first_name || !legal_last_name || !email) {
      return new Response(JSON.stringify({ error: 'operator_id, legal_first_name, legal_last_name, email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Create or find auth user
    let ownerUserId: string | null = null;
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existing = users?.find(u => (u.email ?? '').toLowerCase() === cleanEmail);

    if (existing) {
      ownerUserId = existing.id;
    } else if (send_invite) {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          data: {
            first_name: legal_first_name,
            last_name: legal_last_name,
            invited_as: 'truck_owner',
          },
          redirectTo: `${Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app'}/welcome`,
        },
      );
      if (inviteError) console.error('invite error:', inviteError.message);
      if (inviteData?.user) ownerUserId = inviteData.user.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: { first_name: legal_first_name, last_name: legal_last_name, invited_as: 'truck_owner' },
      });
      if (createErr) console.error('create user err:', createErr.message);
      if (created?.user) ownerUserId = created.user.id;
    }

    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: 'Could not create or resolve owner user' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign truck_owner role
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: ownerUserId, role: 'truck_owner' }, { onConflict: 'user_id,role' });

    // Make sure profile name is set
    await supabaseAdmin
      .from('profiles')
      .update({ first_name: legal_first_name, last_name: legal_last_name })
      .eq('user_id', ownerUserId);

    // Upsert truck_owners row (operator_id is UNIQUE so this enforces 1:1)
    const { error: upsertErr } = await supabaseAdmin
      .from('truck_owners')
      .upsert(
        {
          operator_id,
          user_id: ownerUserId,
          legal_first_name,
          legal_last_name,
          business_name: business_name ?? null,
          email: cleanEmail,
          phone: phone ?? null,
          address_street: address_street ?? null,
          address_city: address_city ?? null,
          address_state: address_state ?? null,
          address_zip: address_zip ?? null,
          invited_at: send_invite ? new Date().toISOString() : null,
          created_by: callerUser.id,
        },
        { onConflict: 'operator_id' },
      );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    const actorName = [callerUser.user_metadata?.first_name, callerUser.user_metadata?.last_name].filter(Boolean).join(' ') || 'Staff';
    await supabaseAdmin.from('audit_log').insert({
      actor_id: callerUser.id,
      actor_name: actorName,
      action: send_invite ? 'truck_owner_invited' : 'truck_owner_created',
      entity_type: 'operator',
      entity_id: operator_id,
      entity_label: `${legal_first_name} ${legal_last_name}`.trim(),
      metadata: { owner_user_id: ownerUserId, email: cleanEmail, business_name: business_name ?? null },
    });

    return new Response(JSON.stringify({ ok: true, owner_user_id: ownerUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('invite-truck-owner error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});