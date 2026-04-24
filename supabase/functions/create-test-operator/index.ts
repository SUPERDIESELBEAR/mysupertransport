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

    const TEST_USER_ID = '7e356f94-ce4a-47aa-8883-0e6b01d09aab';
    const TEST_EMAIL = 'marcsmueller@gmail.com';

    // 1. Check if operator already exists for this user
    const { data: existingOp } = await supabaseAdmin
      .from('operators')
      .select('id')
      .eq('user_id', TEST_USER_ID)
      .maybeSingle();

    if (existingOp) {
      // Check if onboarding_status exists
      const { data: existingOb } = await supabaseAdmin
        .from('onboarding_status')
        .select('id')
        .eq('operator_id', existingOp.id)
        .maybeSingle();

      if (!existingOb) {
        await supabaseAdmin.from('onboarding_status').insert({
          operator_id: existingOp.id,
          ica_status: 'not_issued',
        });
      }

      return new Response(JSON.stringify({
        success: true,
        operator_id: existingOp.id,
        message: 'Operator already exists, ensured onboarding_status is present.',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Insert approved application using the canonical operator email.
    //    The accounts have been consolidated — there is only one Marcus Mueller.
    const testEmail = TEST_EMAIL;
    const { data: app, error: appErr } = await supabaseAdmin
      .from('applications')
      .insert({
        email: testEmail,
        first_name: 'Marcus',
        last_name: 'Mueller',
        user_id: TEST_USER_ID,
        review_status: 'approved',
        is_draft: false,
        submitted_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (appErr) {
      return new Response(JSON.stringify({ error: 'Application insert failed: ' + appErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Insert operator
    const { data: op, error: opErr } = await supabaseAdmin
      .from('operators')
      .insert({
        user_id: TEST_USER_ID,
        application_id: app.id,
        is_active: true,
      })
      .select('id')
      .single();

    if (opErr) {
      return new Response(JSON.stringify({ error: 'Operator insert failed: ' + opErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Insert onboarding_status
    const { error: obErr } = await supabaseAdmin
      .from('onboarding_status')
      .insert({
        operator_id: op.id,
        ica_status: 'not_issued',
      });

    if (obErr) {
      return new Response(JSON.stringify({ error: 'Onboarding insert failed: ' + obErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      application_id: app.id,
      operator_id: op.id,
      message: 'Test operator fully provisioned for ' + TEST_EMAIL,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
