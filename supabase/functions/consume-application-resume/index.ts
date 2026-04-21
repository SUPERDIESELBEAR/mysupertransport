import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!token || token.length < 10 || token.length > 200) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data, error } = await admin.rpc('consume_application_resume_token', { p_token: token });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      let code = 'invalid_token';
      if (msg.includes('token_expired')) code = 'token_expired';
      else if (msg.includes('token_used')) code = 'token_used';
      else if (msg.includes('application_not_found')) code = 'application_not_found';
      return new Response(JSON.stringify({ error: code }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.draft_token) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, draft_token: row.draft_token }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('consume-application-resume error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});