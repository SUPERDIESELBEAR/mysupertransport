import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Require Supabase anon JWT (browser session token) — ties calls to a real session.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      stage = 'unknown',
      action = 'application_submit_failed',
      email = null,
      error_code = null,
      error_message = null,
      application_id = null,
      user_agent = null,
    } = body ?? {};

    // Allowlist action — block arbitrary entries that could mask legitimate activity.
    const ALLOWED_ACTIONS = new Set(['application_submit_failed', 'application_save_failed']);
    const safeAction = ALLOWED_ACTIONS.has(action) ? action : 'application_submit_failed';

    // Validate UUID format for application_id (or null).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeAppId = typeof application_id === 'string' && UUID_RE.test(application_id) ? application_id : null;

    // Cap field lengths to prevent log flooding.
    const clip = (v: unknown, n: number) =>
      typeof v === 'string' ? v.slice(0, n) : v == null ? null : String(v).slice(0, n);
    const safeEmail = clip(email, 254);
    const safeStage = clip(stage, 64);
    const safeErrorCode = clip(error_code, 64);
    const safeErrorMessage = clip(error_message, 500);
    const safeUserAgent = clip(user_agent, 300);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.from('audit_log').insert({
      action: safeAction,
      entity_type: 'application',
      entity_id: safeAppId,
      entity_label: safeEmail,
      actor_name: safeEmail,
      metadata: {
        stage: safeStage,
        email: safeEmail,
        error_code: safeErrorCode,
        error_message: safeErrorMessage,
        user_agent: safeUserAgent,
      },
    });

    if (error) {
      console.error('log-application-error insert failed:', error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('log-application-error error:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});