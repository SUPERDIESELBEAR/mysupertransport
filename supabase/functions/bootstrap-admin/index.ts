import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // One-time bootstrap: creates the first management user
  // Secured by a shared secret passed in the request body
  try {
    const { email, first_name, last_name, bootstrap_secret } = await req.json();

    const BOOTSTRAP_SECRET = Deno.env.get('BOOTSTRAP_SECRET') || 'supertransport-bootstrap-2026';
    if (bootstrap_secret !== BOOTSTRAP_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create or get user via auth invite
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: first_name ?? '', last_name: last_name ?? '', invited_as: 'management' },
      redirectTo: 'https://ab645bc4-83af-495c-aca5-d40c7ca0fb70.lovableproject.com/reset-password',
    });

    let userId: string | null = inviteData?.user?.id ?? null;

    if (inviteError) {
      // User may already exist — look them up
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === email);
      if (existing) userId = existing.id;
      else {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert profile
    await supabaseAdmin.from('profiles').upsert({
      user_id: userId,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      account_status: 'active',
    }, { onConflict: 'user_id' });

    // Assign management role
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role: 'management' },
      { onConflict: 'user_id,role' }
    );

    return new Response(JSON.stringify({ success: true, user_id: userId, message: 'Management account ready. Check email for invite link to set password.' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
