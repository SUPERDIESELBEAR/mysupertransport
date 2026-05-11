## Goal

Make the in-app "Action required: Install SUPERDRIVE" notification take operators directly to the `/install` how-to page (with platform-specific Add to Home Screen instructions) instead of dropping them on `/operator`, where nothing visibly happens.

## Why

Carlos Keys reported the install link "wasn't working." Investigation showed the link is fine, but the in-app notification points to `/operator`, which just opens the portal — there's no automatic install prompt on iOS Safari. Users tap expecting an install flow and see nothing happen. The `/install` page already exists and renders correct iOS / Android instructions.

## Change

**File:** `supabase/functions/notify-pwa-install/index.ts`

- Line 80: change `link: '/operator'` to `link: '/install'`.

That's the only code change. Existing notifications already in users' bells will keep their old link; only newly-generated reminders (daily cron + any future manual sends) pick up the new destination.

## Out of scope

- No change to the email CTA (it already lands on the splash and works).
- No change to the daily cron schedule, cooldown, or template.
- No new UI, no migration, no new edge function.
