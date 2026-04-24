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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const TEST_OPERATOR_ID = 'ee993ec0-e0a2-4d0f-aa05-6d22eb931405';
    const PREFIX = `${TEST_OPERATOR_ID}/truck_photos/`;

    // 1. List storage objects under the prefix
    const { data: files, error: listErr } = await admin.storage
      .from('operator-documents')
      .list(`${TEST_OPERATOR_ID}/truck_photos`, { limit: 1000 });
    if (listErr) throw new Error(`list: ${listErr.message}`);

    // 2. Remove them via the Storage API (allowed)
    const paths = (files ?? []).map(f => `${PREFIX}${f.name}`);
    let removedFiles = 0;
    if (paths.length > 0) {
      const { error: rmErr } = await admin.storage.from('operator-documents').remove(paths);
      if (rmErr) throw new Error(`remove: ${rmErr.message}`);
      removedFiles = paths.length;
    }

    // 3. Delete the matching operator_documents rows
    const { data: deletedRows, error: dbErr } = await admin
      .from('operator_documents')
      .delete()
      .eq('operator_id', TEST_OPERATOR_ID)
      .eq('document_type', 'truck_photos')
      .select('id');
    if (dbErr) throw new Error(`db: ${dbErr.message}`);

    return new Response(JSON.stringify({
      success: true,
      removedFiles,
      removedRows: deletedRows?.length ?? 0,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});