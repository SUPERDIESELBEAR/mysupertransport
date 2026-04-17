import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * One-shot fixer for `inspection_documents` rows whose `file_url` is broken.
 *
 * Two scenarios handled:
 *   A) Bare storage path like "applications/foo.jpg" (legacy invite-operator bug)
 *      → re-sign from the `application-documents` bucket.
 *   B) Signed URL but the embedded JWT `exp` is in the past (1-hour URLs saved
 *      by the in-app document editor before the 5-year fix)
 *      → re-sign from the `inspection-documents` bucket using `file_path`.
 *
 * Idempotent — re-signing a healthy URL is harmless.
 * Restricted to management / onboarding_staff / owner callers.
 */

const FIVE_YEARS_SECS = 60 * 60 * 24 * 365 * 5;

/** Decode the JWT inside a Supabase signed URL and return its `exp` (seconds since epoch), or null. */
function getSignedUrlExp(url: string): number | null {
  try {
    const u = new URL(url);
    const token = u.searchParams.get('token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

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

    let bareUpdated = 0;
    let bareFailed = 0;
    let expiredUpdated = 0;
    let expiredFailed = 0;
    let expiredSkipped = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    // ── A) Bare-path rows (applications/...) ────────────────────────────────
    const { data: bare, error: bareErr } = await supabaseAdmin
      .from('inspection_documents')
      .select('id, file_url')
      .like('file_url', 'applications/%');

    if (bareErr) {
      return new Response(JSON.stringify({ error: bareErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const row of bare ?? []) {
      const path = row.file_url as string;
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from('application-documents')
        .createSignedUrl(path, FIVE_YEARS_SECS);

      if (signErr || !signed?.signedUrl) {
        bareFailed++;
        errors.push({ id: row.id, reason: signErr?.message || 'no signed url returned (application-documents)' });
        continue;
      }

      const { error: updErr } = await supabaseAdmin
        .from('inspection_documents')
        .update({ file_url: signed.signedUrl, file_path: path })
        .eq('id', row.id);

      if (updErr) {
        bareFailed++;
        errors.push({ id: row.id, reason: updErr.message });
      } else {
        bareUpdated++;
      }
    }

    // ── B) Expired-token rows in inspection-documents bucket ────────────────
    const { data: signedRows, error: selErr } = await supabaseAdmin
      .from('inspection_documents')
      .select('id, file_url, file_path')
      .not('file_path', 'is', null)
      .like('file_url', '%token=%');

    if (selErr) {
      return new Response(JSON.stringify({ error: selErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    // Re-sign anything whose token expires within the next 30 days (catches
    // already-expired and short-TTL editor saves). Healthy 5-year URLs are skipped.
    const RESIGN_THRESHOLD = nowSecs + 60 * 60 * 24 * 30;

    for (const row of signedRows ?? []) {
      const url = row.file_url as string;
      const path = row.file_path as string;
      if (!path) { expiredSkipped++; continue; }

      const exp = getSignedUrlExp(url);
      if (exp !== null && exp > RESIGN_THRESHOLD) {
        expiredSkipped++;
        continue;
      }

      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from('inspection-documents')
        .createSignedUrl(path, FIVE_YEARS_SECS);

      if (signErr || !signed?.signedUrl) {
        expiredFailed++;
        errors.push({ id: row.id, reason: signErr?.message || 'no signed url returned (inspection-documents)' });
        continue;
      }

      const { error: updErr } = await supabaseAdmin
        .from('inspection_documents')
        .update({ file_url: signed.signedUrl })
        .eq('id', row.id);

      if (updErr) {
        expiredFailed++;
        errors.push({ id: row.id, reason: updErr.message });
      } else {
        expiredUpdated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        bare: {
          scanned: bare?.length ?? 0,
          updated: bareUpdated,
          failed: bareFailed,
        },
        expired: {
          scanned: signedRows?.length ?? 0,
          updated: expiredUpdated,
          failed: expiredFailed,
          skipped_healthy: expiredSkipped,
        },
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
