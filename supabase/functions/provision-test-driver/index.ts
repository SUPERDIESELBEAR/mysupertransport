import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One-off helper to provision an arbitrary fully-onboarded test driver
// (mirrors invite-operator skip_invite=true path but is gated by BOOTSTRAP_SECRET
// so it can run without an authenticated caller).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { bootstrap_secret, application_id, assigned_staff_user_id } = body ?? {};

    const BOOTSTRAP_SECRET =
      Deno.env.get('BOOTSTRAP_SECRET') || 'supertransport-bootstrap-2026';
    if (bootstrap_secret !== BOOTSTRAP_SECRET) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: app, error: appErr } = await admin
      .from('applications').select('*').eq('id', application_id).single();
    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark approved
    await admin.from('applications').update({
      review_status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewer_notes: 'Pre-existing operator added directly',
      is_draft: false,
    }).eq('id', application_id);

    // Find or create auth user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u: any) => u.email === app.email);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: app.email,
        email_confirm: true,
        user_metadata: {
          first_name: app.first_name ?? '',
          last_name: app.last_name ?? '',
          invited_as: 'operator',
        },
      });
      if (cErr || !created?.user) {
        return new Response(JSON.stringify({ error: 'createUser failed: ' + cErr?.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = created.user.id;
    }

    await admin.from('applications').update({ user_id: userId }).eq('id', application_id);
    await admin.from('user_roles').upsert(
      { user_id: userId!, role: 'operator' },
      { onConflict: 'user_id,role' }
    );
    await admin.from('profiles').update({
      first_name: app.first_name ?? null,
      last_name: app.last_name ?? null,
    }).eq('user_id', userId!);

    // Operator
    const { data: existingOp } = await admin.from('operators')
      .select('id').eq('user_id', userId!).maybeSingle();

    let operatorId: string | null = existingOp?.id ?? null;
    if (!existingOp) {
      const { data: newOp, error: opErr } = await admin.from('operators').insert({
        user_id: userId,
        application_id,
        assigned_onboarding_staff: assigned_staff_user_id ?? null,
        is_active: true,
      }).select('id').single();
      if (opErr || !newOp) {
        return new Response(JSON.stringify({ error: 'operator insert: ' + opErr?.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      operatorId = newOp.id;

      const today = new Date().toISOString().split('T')[0];
      await admin.from('onboarding_status').insert({
        operator_id: operatorId,
        mvr_status: 'received', ch_status: 'received',
        mvr_ch_approval: 'approved',
        pe_screening: 'results_in', pe_screening_result: 'clear',
        form_2290: 'received', truck_title: 'received',
        truck_photos: 'received', truck_inspection: 'received',
        ica_status: 'complete',
        mo_docs_submitted: 'submitted', mo_reg_received: 'yes',
        decal_applied: 'yes', eld_installed: 'yes', fuel_card_issued: 'yes',
        insurance_added_date: today,
        go_live_date: today,
      });
      await admin.from('active_dispatch').insert({
        operator_id: operatorId,
        dispatch_status: 'not_dispatched',
        updated_by: assigned_staff_user_id ?? null,
      });
    }

    return new Response(JSON.stringify({
      success: true, user_id: userId, operator_id: operatorId,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});