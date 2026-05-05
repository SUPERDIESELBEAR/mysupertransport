import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from('operator_broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(20);
  if (error) {
    console.error('dispatch-scheduled-broadcasts query error', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const row of due ?? []) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-operator-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': serviceKey,
        },
        body: JSON.stringify({ mode: 'dispatch', broadcastId: row.id }),
      });
      const ok = res.ok;
      const text = ok ? '' : await res.text();
      if (!ok) {
        await admin.from('operator_broadcasts')
          .update({ status: 'failed' }).eq('id', row.id);
      }
      results.push({ id: row.id, ok, error: ok ? undefined : text });
    } catch (e) {
      await admin.from('operator_broadcasts')
        .update({ status: 'failed' }).eq('id', row.id);
      results.push({ id: row.id, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});