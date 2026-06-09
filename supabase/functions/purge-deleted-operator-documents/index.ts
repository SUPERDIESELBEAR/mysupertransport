import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Permanently removes operator_documents that were soft-deleted more than
 * 30 days ago: deletes the underlying storage object, then the DB row, then
 * writes an audit_log entry.
 *
 * Auth: requires either an `x-cron-secret` header matching the CRON_SECRET
 * env var, or a service-role Bearer token. Matches the project pattern for
 * other cron-invoked edge functions.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

  const headerSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
  const authorized =
    (cronSecret && headerSecret === cronSecret) ||
    (serviceKey && bearer === serviceKey);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'server_not_configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from('operator_documents')
    .select('id, operator_id, document_type, file_name, file_url')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let purged = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const row of rows ?? []) {
    try {
      if (row.file_url) {
        try {
          const url = new URL(row.file_url);
          const m =
            url.pathname.match(/\/object\/sign\/operator-documents\/(.+)/) ||
            url.pathname.match(/\/object\/public\/operator-documents\/(.+)/);
          if (m) {
            const path = decodeURIComponent(m[1].split('?')[0]);
            await admin.storage.from('operator-documents').remove([path]);
          }
        } catch (_e) {
          // Storage removal best-effort
        }
      }
      const { error: delErr } = await admin
        .from('operator_documents')
        .delete()
        .eq('id', row.id);
      if (delErr) throw new Error(delErr.message);

      await admin.from('audit_log').insert({
        action: 'document_purged',
        entity_type: 'operator',
        entity_id: row.operator_id,
        metadata: {
          document_id: row.id,
          document_type: row.document_type,
          file_name: row.file_name,
          file_url: row.file_url,
        },
      });
      purged += 1;
    } catch (e: any) {
      failures.push({ id: row.id, reason: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify({ purged, failures, cutoff }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});