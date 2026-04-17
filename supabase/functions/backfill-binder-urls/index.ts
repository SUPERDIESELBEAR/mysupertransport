import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * One-shot fixer: re-signs `inspection_documents` rows whose `file_url` is a
 * bare storage path like `applications/...` instead of a full URL.
 *
 * Idempotent — only touches rows where file_url LIKE 'applications/%'.
 * Restricted to management / onboarding_staff callers.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['management', 'onboarding_staff', 'owner'])
      .limit(1);
    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Find broken rows ─────────────────────────────────────────────────────
    const { data: broken, error: selErr } = await supabaseAdmin
      .from('inspection_documents')
      .select('id, file_url, name')
      .like('file_url', 'applications/%');

    if (selErr) {
      return new Response(JSON.stringify({ error: selErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const FIVE_YEARS_SECS = 60 * 60 * 24 * 365 * 5;
    let updated = 0;
    let failed = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    for (const row of broken ?? []) {
      const path = row.file_url as string;
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from('application-documents')
        .createSignedUrl(path, FIVE_YEARS_SECS);

      if (signErr || !signed?.signedUrl) {
        failed++;
        errors.push({ id: row.id, reason: signErr?.message || 'no signed url returned' });
        continue;
      }

      const { error: updErr } = await supabaseAdmin
        .from('inspection_documents')
        .update({ file_url: signed.signedUrl, file_path: path })
        .eq('id', row.id);

      if (updErr) {
        failed++;
        errors.push({ id: row.id, reason: updErr.message });
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: broken?.length ?? 0,
        updated,
        failed,
        errors: errors.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('backfill-binder-urls error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
