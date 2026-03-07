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

    const { application_id, reviewer_notes } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch application for email data
    const { data: app } = await supabaseAdmin
      .from('applications')
      .select('email, first_name, last_name')
      .eq('id', application_id)
      .single();

    const { error } = await supabaseAdmin
      .from('applications')
      .update({
        review_status: 'denied',
        reviewed_at: new Date().toISOString(),
        reviewed_by: callerUser.id,
        reviewer_notes: reviewer_notes ?? null,
      })
      .eq('id', application_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire denial notification email (fire-and-forget)
    if (app?.email) {
      const notifUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`;
      fetch(notifUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          type: 'application_denied',
          applicant_name: `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.email,
          applicant_email: app.email,
          reviewer_notes: reviewer_notes ?? null,
        }),
      }).catch(e => console.error('Notification fire-and-forget error:', e));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
