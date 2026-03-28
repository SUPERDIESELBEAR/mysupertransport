import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmail, sendEmail, BRAND_NAME } from '../_shared/email-layout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const currentYear = now.getFullYear();

    // 1. Find active operators with birthday or anniversary today
    const { data: operators, error: opErr } = await supabase
      .from('operators')
      .select(`
        id,
        user_id,
        applications!inner (email, first_name, last_name, dob),
        onboarding_status!inner (go_live_date)
      `)
      .eq('is_active', true);

    if (opErr) throw opErr;
    if (!operators || operators.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No active operators found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let birthdaySent = 0;
    let anniversarySent = 0;

    for (const op of operators as any[]) {
      const app = op.applications;
      const onb = op.onboarding_status;
      if (!app) continue;

      const firstName = app.first_name || 'Driver';
      const email = app.email;
      if (!email) continue;

      // Check birthday
      const dob = app.dob;
      const isBirthday = dob && (() => {
        const d = new Date(dob + 'T12:00:00');
        return d.getMonth() + 1 === month && d.getDate() === day;
      })();

      // Check anniversary
      const goLive = onb?.go_live_date;
      const isAnniversary = goLive && (() => {
        const d = new Date(goLive + 'T12:00:00');
        return d.getMonth() + 1 === month && d.getDate() === day && d.getFullYear() !== currentYear;
      })();

      // Check notification preferences
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('email_enabled, in_app_enabled')
        .eq('user_id', op.user_id)
        .eq('event_type', 'birthday_anniversary')
        .maybeSingle();

      const emailEnabled = prefs?.email_enabled !== false;
      const inAppEnabled = prefs?.in_app_enabled !== false;

      // Birthday
      if (isBirthday) {
        if (emailEnabled && resendKey) {
          const html = buildEmail(
            `Happy Birthday, ${firstName}! 🎂`,
            `Happy Birthday, ${firstName}! 🎂`,
            `<p>The entire <strong>${BRAND_NAME}</strong> family wants to wish you a very happy birthday!</p>
             <p>We appreciate everything you do and hope you have a wonderful day filled with joy and celebration.</p>
             <p>Here's to another great year ahead! 🎉</p>
             <p style="margin-top:24px;">Warm regards,<br/><strong>The ${BRAND_NAME} Team</strong></p>`
          );
          await sendEmail(email, `Happy Birthday, ${firstName}! 🎂`, html, resendKey);
        }

        if (inAppEnabled) {
          await supabase.from('notifications').insert({
            user_id: op.user_id,
            type: 'birthday_anniversary',
            title: `Happy Birthday, ${firstName}! 🎂`,
            body: `The ${BRAND_NAME} family wishes you a wonderful birthday!`,
          });
        }
        birthdaySent++;
      }

      // Anniversary
      if (isAnniversary) {
        const goLiveDate = new Date(goLive + 'T12:00:00');
        const years = currentYear - goLiveDate.getFullYear();
        const yearLabel = years === 1 ? '1 year' : `${years} years`;

        if (emailEnabled && resendKey) {
          const html = buildEmail(
            `Congratulations on ${yearLabel} with ${BRAND_NAME}! 🎉`,
            `Happy Anniversary, ${firstName}! 🎉`,
            `<p>Today marks <strong>${yearLabel}</strong> since you became an active operator with <strong>${BRAND_NAME}</strong>!</p>
             <p>Your dedication, hard work, and commitment have been a vital part of our success. We're proud to have you on the team.</p>
             <p>Here's to many more miles and milestones together! 🚛</p>
             <p style="margin-top:24px;">With appreciation,<br/><strong>The ${BRAND_NAME} Team</strong></p>`
          );
          await sendEmail(email, `Congratulations on ${yearLabel} with ${BRAND_NAME}! 🎉`, html, resendKey);
        }

        if (inAppEnabled) {
          await supabase.from('notifications').insert({
            user_id: op.user_id,
            type: 'birthday_anniversary',
            title: `Happy ${yearLabel} Anniversary! 🎉`,
            body: `Congratulations on ${yearLabel} with ${BRAND_NAME}! Thank you for your dedication.`,
          });
        }
        anniversarySent++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, birthdaySent, anniversarySent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Birthday/anniversary function error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
