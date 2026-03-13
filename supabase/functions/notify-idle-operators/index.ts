import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IDLE_DAYS = 14;
// Deduplicate: don't re-notify the same coordinator about the same operator within 24 hours
const DEDUP_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const idleCutoff = new Date(Date.now() - IDLE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Fetch operators who are not fully onboarded and whose onboarding_status
    // hasn't been updated in 14+ days, and who have an assigned coordinator
    const { data: idleStatuses, error: fetchError } = await supabase
      .from('onboarding_status')
      .select(`
        operator_id,
        updated_at,
        fully_onboarded,
        operators!inner (
          id,
          assigned_onboarding_staff,
          application_id,
          applications (
            first_name,
            last_name
          )
        )
      `)
      .eq('fully_onboarded', false)
      .lt('updated_at', idleCutoff)
      .not('operators.assigned_onboarding_staff', 'is', null);

    if (fetchError) throw fetchError;

    if (!idleStatuses || idleStatuses.length === 0) {
      console.log('notify-idle-operators: no idle operators found');
      return new Response(
        JSON.stringify({ message: 'No idle operators found', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dedupCutoff = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString();
    const notificationsToInsert: Array<{
      user_id: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      link: string;
    }> = [];

    for (const row of idleStatuses) {
      const op = Array.isArray(row.operators) ? row.operators[0] : row.operators as {
        id: string;
        assigned_onboarding_staff: string | null;
        application_id: string | null;
        applications: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
      };
      if (!op || !op.assigned_onboarding_staff) continue;

      const app = Array.isArray(op.applications)
        ? op.applications[0]
        : op.applications;

      const operatorName =
        [app?.first_name, app?.last_name].filter(Boolean).join(' ').trim() || 'An operator';

      const staffId = op.assigned_onboarding_staff;
      const operatorId = row.operator_id;

      // Respect coordinator's in-app preference for operator_idle
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('in_app_enabled')
        .eq('user_id', staffId)
        .eq('event_type', 'operator_idle')
        .maybeSingle();
      // Default is enabled; only skip if explicitly disabled
      if (pref?.in_app_enabled === false) continue;

      // Calculate days idle (rounded)
      const lastActivity = new Date(row.updated_at);
      const daysIdle = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

      // Deduplicate: skip if a recent idle notification already exists for this staff+operator pair
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', staffId)
        .eq('type', 'operator_idle')
        .ilike('link', `%${operatorId}%`)
        .gte('sent_at', dedupCutoff)
        .limit(1);

      if (existing && existing.length > 0) continue;

      notificationsToInsert.push({
        user_id: staffId,
        title: `${operatorName} — No Activity for ${daysIdle} Days`,
        body: `${operatorName} has had no onboarding status update in ${daysIdle} days. Follow up to keep onboarding on track.`,
        type: 'operator_idle',
        channel: 'in_app',
        link: `/staff?operator=${operatorId}`,
      });
    }

    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);
      if (insertError) throw insertError;
    }

    console.log(`notify-idle-operators: inserted ${notificationsToInsert.length} notifications for ${idleStatuses.length} idle operators`);

    return new Response(
      JSON.stringify({
        message: 'Done',
        idleOperators: idleStatuses.length,
        inserted: notificationsToInsert.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('notify-idle-operators error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
