import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { bootstrap_secret } = await req.json();

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

    const email = 'marcsmueller@gmail.com';
    const firstName = 'Marcus';
    const lastName = 'Mueller';

    // 1. Create or find auth user via invite
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName, invited_as: 'operator' },
      redirectTo: `${Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app'}/reset-password`,
    });

    let userId: string | null = inviteData?.user?.id ?? null;

    if (inviteError) {
      // User might already exist
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === email);
      if (existing) {
        userId = existing.id;
      } else {
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

    // 2. Profile
    await supabaseAdmin.from('profiles').upsert({
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      account_status: 'active',
    }, { onConflict: 'user_id' });

    // 3. Role
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: userId, role: 'operator' },
      { onConflict: 'user_id,role' }
    );

    // 4. Application record (minimal approved)
    const appId = crypto.randomUUID();
    const { error: appErr } = await supabaseAdmin.from('applications').insert({
      id: appId,
      email,
      first_name: firstName,
      last_name: lastName,
      user_id: userId,
      review_status: 'approved',
      is_draft: false,
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    });

    if (appErr) {
      return new Response(JSON.stringify({ error: 'App insert: ' + appErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Operator record
    const operatorId = crypto.randomUUID();
    const { error: opErr } = await supabaseAdmin.from('operators').insert({
      id: operatorId,
      user_id: userId,
      application_id: appId,
      is_active: true,
    });

    if (opErr) {
      return new Response(JSON.stringify({ error: 'Operator insert: ' + opErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Onboarding status (Stage 1 defaults)
    const { error: osErr } = await supabaseAdmin.from('onboarding_status').insert({
      operator_id: operatorId,
    });

    if (osErr) {
      return new Response(JSON.stringify({ error: 'Onboarding insert: ' + osErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      operator_id: operatorId,
      application_id: appId,
      message: 'Test operator created. Check marcsmueller@gmail.com for the invite email to set your password.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
