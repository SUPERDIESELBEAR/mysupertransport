# PWA Install Reminder — Messaging Update

## Goal
Refresh the install reminder content so it leads with the Google Drive → SUPERDRIVE migration message, warning drivers that the old Roadside Inspection binder in Google Drive will no longer be accessible. Keep current cadence (daily until installed) and current channels (in-app + email). SMS is deferred.

## Scope
- Edge function: `supabase/functions/notify-pwa-install/index.ts`
  - Rewrite the in-app notification body (title + message) used in the cron and manual flows.
  - Rewrite the email subject + HTML body, keeping the existing iPhone (Safari) / Android (Chrome) install steps.
  - Lead with the Drive deprecation warning; emphasize SUPERDRIVE as the new source for Roadside Inspection Binder docs.
- No changes to:
  - Cadence (daily cron + 24h cooldown remain as-is)
  - Eligibility (active operators with `pwa_installed_at IS NULL`)
  - SMS (not implemented in this round)
  - Driver Hub manual reminder button (it already calls the same function and will pick up the new wording automatically)

## Approved Wording

**In-app notification**
- Title: `Action required: Install SUPERDRIVE`
- Body: `The Roadside Inspection Binder is moving from Google Drive to SUPERDRIVE. Your existing Drive binder will no longer be updated or accessible. Install the SUPERDRIVE app now so you always have the latest inspection documents on hand. Tap for install instructions.`

**Email**
- Subject: `Install SUPERDRIVE — your Roadside Inspection Binder is moving`
- Lead paragraph: `Your Roadside Inspection Binder is moving out of Google Drive and into SUPERDRIVE. The Drive copy will no longer be updated and will soon be inaccessible. To make sure you always have current inspection documents, install the SUPERDRIVE app today.`
- Keep the existing iPhone (Safari → Share → Add to Home Screen) and Android (Chrome → menu → Install app / Add to Home screen) instruction blocks unchanged.
- Closing line: `Once installed, SUPERDRIVE becomes your single, always-current source for Roadside Inspection Binder documents and other compliance items.`

## Out of Scope (deferred)
- SMS channel (Twilio/Brevo)
- Cadence changes / cap on total reminders
- Hard cutoff date for Drive binder access (can be added later when finalized)

## Verification
- Trigger the manual "Send install reminder" button on a test operator from Driver Hub and confirm the new in-app notification text and email content.
- Confirm 24h cooldown still blocks a second send within the window.

## Memory updates
- Update `mem://features/pwa-install-reminders.md` to note the new messaging focus (Drive deprecation) and that SMS was considered and deferred.
