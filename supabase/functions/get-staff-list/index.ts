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

    // Verify caller is management
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
      .eq('role', 'management')
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden: management only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle role update requests (POST with action)
    if (req.method === 'POST') {
      const body = await req.json();
      const { action, user_id, role } = body as { action: string; user_id: string; role: string };

      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: 'user_id and role are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const validRoles = ['onboarding_staff', 'dispatcher', 'management'];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: 'Invalid role' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Prevent removing your own management role
      if (action === 'remove' && user_id === callerUser.id && role === 'management') {
        return new Response(JSON.stringify({ error: 'Cannot remove your own management role' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'add') {
        await supabaseAdmin.from('user_roles').upsert(
          { user_id, role },
          { onConflict: 'user_id,role' }
        );
      } else if (action === 'remove') {
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', user_id)
          .eq('role', role);
      } else {
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET: Fetch full staff list
    // 1. Get all staff role rows
    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['management', 'onboarding_staff', 'dispatcher']);

    if (!roleRows?.length) {
      return new Response(JSON.stringify({ staff: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const staffUserIds = [...new Set(roleRows.map((r) => r.user_id))];

    // 2. Get profiles
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('user_id, first_name, last_name, account_status, created_at, updated_at')
      .in('user_id', staffUserIds);

    // 3. Get emails from auth.users via admin API
    const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap: Record<string, string> = {};
    for (const u of authUsers ?? []) {
      if (u.email) emailMap[u.id] = u.email;
    }

    // 4. Get assigned operator counts per staff member
    const { data: operators } = await supabaseAdmin
      .from('operators')
      .select('assigned_onboarding_staff')
      .not('assigned_onboarding_staff', 'is', null);

    const operatorCountMap: Record<string, number> = {};
    for (const op of operators ?? []) {
      if (op.assigned_onboarding_staff) {
        operatorCountMap[op.assigned_onboarding_staff] = (operatorCountMap[op.assigned_onboarding_staff] ?? 0) + 1;
      }
    }

    // 5. Merge everything
    const staff = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: emailMap[p.user_id] ?? null,
      account_status: p.account_status,
      created_at: p.created_at,
      updated_at: p.updated_at,
      roles: roleRows.filter((r) => r.user_id === p.user_id).map((r) => r.role),
      assigned_operator_count: operatorCountMap[p.user_id] ?? 0,
    }));

    return new Response(JSON.stringify({ staff }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('get-staff-list error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
