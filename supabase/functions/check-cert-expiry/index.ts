import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch all operators with their application data and assigned staff
    const { data: operators, error: opError } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        assigned_onboarding_staff,
        applications (
          first_name,
          last_name,
          cdl_expiration,
          medical_cert_expiration
        )
      `);

    if (opError) throw opError;
    if (!operators || operators.length === 0) {
      return new Response(JSON.stringify({ message: 'No operators found', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ALERT_DAYS = [90, 60, 30];
    const notificationsToInsert: Array<{
      user_id: string;
      title: string;
      body: string;
      type: string;
      channel: string;
      link: string;
    }> = [];

    // Track which (user_id, type) pairs we've already queued this run
    const queued = new Set<string>();

    for (const op of operators) {
      const app = Array.isArray(op.applications)
        ? op.applications[0]
        : op.applications;

      if (!app) continue;

      const operatorName =
        [app.first_name, app.last_name].filter(Boolean).join(' ').trim() ||
        'Your';

      const docs: { label: string; field: string; expDate: string | null }[] = [
        { label: 'CDL', field: 'cdl', expDate: app.cdl_expiration },
        { label: 'Medical Certificate', field: 'med_cert', expDate: app.medical_cert_expiration },
      ];

      for (const doc of docs) {
        if (!doc.expDate) continue;

        const expiry = new Date(doc.expDate);
        expiry.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        for (const threshold of ALERT_DAYS) {
          // Fire within a ±1 day window of each threshold to handle slight scheduling drift
          if (Math.abs(daysLeft - threshold) > 1) continue;

          const notifType = `cert_expiry_${threshold}d`;
          const expiryStr = expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          // ── Operator notification ──
          const opKey = `${op.user_id}|${notifType}|${doc.field}`;
          if (!queued.has(opKey)) {
            // Dedup: skip if a matching unread notification was sent in the last 26 hours
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', op.user_id)
              .eq('type', notifType)
              .ilike('body', `%${doc.label}%`)
              .is('read_at', null)
              .gte('sent_at', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (!existing || existing.length === 0) {
              notificationsToInsert.push({
                user_id: op.user_id,
                title: `${doc.label} Expiring in ${daysLeft} Days`,
                body: `Your ${doc.label} expires on ${expiryStr}. Please renew it promptly to stay compliant.`,
                type: notifType,
                channel: 'in_app',
                link: '/operator/progress',
              });
              queued.add(opKey);
            }
          }

          // ── Assigned onboarding staff notification ──
          if (op.assigned_onboarding_staff) {
            const staffKey = `${op.assigned_onboarding_staff}|${notifType}|${doc.field}|${op.id}`;
            if (!queued.has(staffKey)) {
              const { data: existingStaff } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', op.assigned_onboarding_staff)
                .eq('type', notifType)
                .ilike('body', `%${operatorName}%`)
                .ilike('body', `%${doc.label}%`)
                .is('read_at', null)
                .gte('sent_at', new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString())
                .limit(1);

              if (!existingStaff || existingStaff.length === 0) {
                notificationsToInsert.push({
                  user_id: op.assigned_onboarding_staff,
                  title: `${operatorName} — ${doc.label} Expiring in ${daysLeft} Days`,
                  body: `${operatorName}'s ${doc.label} expires on ${expiryStr}. Follow up to ensure renewal.`,
                  type: notifType,
                  channel: 'in_app',
                  link: `/staff?operator=${op.id}`,
                });
                queued.add(staffKey);
              }
            }
          }

          break; // Only fire the closest matching threshold per doc per operator
        }
      }
    }

    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);
      if (insertError) throw insertError;
    }

    console.log(`check-cert-expiry: inserted ${notificationsToInsert.length} notifications`);

    return new Response(
      JSON.stringify({ message: 'Done', inserted: notificationsToInsert.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('check-cert-expiry error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
