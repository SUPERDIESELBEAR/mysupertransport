import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { buildEmail, sendEmail, BRAND_COLOR, BRAND_DARK } from '../_shared/email-layout.ts'

const APP_URL = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Accept optional operator_id to target a single operator
    const body = await req.json().catch(() => ({}))
    const targetOperatorId: string | null = body?.operator_id || null
    const mode: string = body?.mode || (targetOperatorId ? 'manual' : 'manual')
    console.log('notify-pwa-install invoked', { targetOperatorId, mode })

    // Get operators that have NOT installed the PWA yet
    let query = supabase
      .from('operators')
      .select('id, user_id, application_id')
      .eq('is_active', true)
      .is('pwa_installed_at', null)

    if (targetOperatorId) {
      query = query.eq('id', targetOperatorId)
    }

    const { data: operators, error: opErr } = await query

    if (opErr) throw opErr

    let notified = 0
    let skipped = 0

    for (const op of operators || []) {
      if (!op.user_id) { skipped++; continue }

      // 24-hour cooldown: skip if a pwa_install notification was already
      // sent to this user in the past 24 hours (applies to bulk + targeted).
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', op.user_id)
        .eq('type', 'pwa_install')
        .gte('sent_at', cutoff)
        .limit(1)

      if (recent && recent.length > 0) { skipped++; continue }

      // Check notification preferences
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('in_app_enabled')
        .eq('user_id', op.user_id)
        .eq('event_type', 'onboarding_update')
        .limit(1)

      const inAppEnabled = pref?.[0]?.in_app_enabled ?? true

      // Insert in-app notification
      if (inAppEnabled) {
        await supabase.from('notifications').insert({
          user_id: op.user_id,
          title: '📱 Install SUPERDRIVE on your phone',
          body: 'SUPERDRIVE is now available as a standalone app! Install it on your phone for quick access to your portal, documents, and messages.',
          type: 'pwa_install',
          channel: 'in_app',
          link: '/operator',
          sent_at: new Date().toISOString(),
        })
      }

      // Get operator email from application or profile
      let email: string | null = null

      if (op.application_id) {
        const { data: app } = await supabase
          .from('applications')
          .select('email')
          .eq('id', op.application_id)
          .single()
        email = app?.email || null
      }

      if (!email) {
        // Try auth user email via profile lookup isn't possible,
        // so we skip email for operators without an application email
        skipped++
        notified++ // still counted for in-app
        continue
      }

      // Build and send email
      const subject = '📱 Install SUPERDRIVE on Your Phone'
      const body = `
        <p>Great news! <strong>SUPERDRIVE</strong> is now available as a standalone app you can install directly on your phone — no app store needed.</p>
        
        <p>Once installed, SUPERDRIVE will appear on your home screen just like any other app, giving you instant access to your portal, documents, messages, and onboarding status.</p>

        <div style="background:#f8f8f8;border-radius:10px;padding:24px;margin:24px 0;">
          <p style="margin:0 0 12px;font-weight:700;color:${BRAND_DARK};">📱 Android (Chrome)</p>
          <ol style="margin:0 0 20px;padding-left:20px;color:#444;line-height:1.8;">
            <li>Open SUPERDRIVE in <strong>Chrome</strong></li>
            <li>Tap the <strong>"Install"</strong> banner at the bottom, <em>or</em></li>
            <li>Tap <strong>⋮ Menu → Add to Home Screen</strong></li>
          </ol>

          <p style="margin:0 0 12px;font-weight:700;color:${BRAND_DARK};">🍎 iPhone (Safari)</p>
          <ol style="margin:0;padding-left:20px;color:#444;line-height:1.8;">
            <li>Open SUPERDRIVE in <strong>Safari</strong></li>
            <li>Tap the <strong>Share</strong> button (square with arrow)</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          </ol>
        </div>

        <p style="color:#666;font-size:14px;">After installing, you can open SUPERDRIVE from your home screen anytime — no need to open a browser first.</p>
      `

      const html = buildEmail(
        subject,
        'Install SUPERDRIVE on Your Phone',
        body,
        { label: 'Open SUPERDRIVE', url: APP_URL },
      )

      await sendEmail(email, subject, html, resendKey)
      notified++
    }

    return new Response(
      JSON.stringify({ success: true, notified, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    console.error('notify-pwa-install error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
