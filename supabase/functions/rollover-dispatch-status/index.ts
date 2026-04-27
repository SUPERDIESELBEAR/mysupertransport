import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayInChicago(): string {
  // en-CA gives YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = todayInChicago();

    // Pull today's calendar rows joined to operators so we can filter excluded ones.
    const { data: logs, error: logsErr } = await supabase
      .from('dispatch_daily_log')
      .select('operator_id, status, operators!inner(excluded_from_dispatch)')
      .eq('log_date', today);

    if (logsErr) throw logsErr;

    const eligible = (logs ?? []).filter(
      (r: any) => r?.operators?.excluded_from_dispatch !== true,
    );

    let promoted = 0;
    let skipped = 0;
    const errors: Array<{ operator_id: string; error: string }> = [];

    for (const row of eligible) {
      const operatorId = (row as any).operator_id as string;
      const newStatus = (row as any).status as string;

      // Read current live status
      const { data: live, error: liveErr } = await supabase
        .from('active_dispatch')
        .select('id, dispatch_status')
        .eq('operator_id', operatorId)
        .maybeSingle();

      if (liveErr) {
        errors.push({ operator_id: operatorId, error: liveErr.message });
        continue;
      }

      if (live && live.dispatch_status === newStatus) {
        skipped++;
        continue;
      }

      // Upsert active_dispatch (covers missing-row case too)
      const { error: upErr } = await supabase
        .from('active_dispatch')
        .upsert(
          {
            operator_id: operatorId,
            dispatch_status: newStatus,
            updated_by: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'operator_id' },
        );

      if (upErr) {
        errors.push({ operator_id: operatorId, error: upErr.message });
        continue;
      }

      // History row — the log_dispatch_status_change trigger also inserts one
      // when dispatch_status changes, but we add an explicit note for clarity.
      const { error: histErr } = await supabase
        .from('dispatch_status_history')
        .insert({
          operator_id: operatorId,
          dispatch_status: newStatus,
          changed_by: null,
          status_notes: 'Daily rollover from calendar',
        });

      if (histErr) {
        // Non-fatal — the trigger row still records the change.
        console.warn('[rollover] history insert failed', operatorId, histErr.message);
      }

      promoted++;
    }

    const result = {
      today,
      checked: eligible.length,
      promoted,
      skipped,
      errors,
    };

    console.log('[rollover-dispatch-status]', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[rollover-dispatch-status] error', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});