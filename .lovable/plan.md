

## Option D: In-App Notification + Email Blast for PWA Install

### What This Does

Sends every active operator two notifications announcing the SUPERDRIVE app:
1. An **in-app notification** (appears in their notification bell)
2. A **branded email** with install instructions for both Android and iOS

### Implementation

**1. Edge Function: `notify-pwa-install`** (new)
- Queries all active operators with a linked `user_id`
- For each operator:
  - Inserts an in-app notification into the `notifications` table with title "Install SUPERDRIVE on your phone", body explaining the app is now available, and link to `/operator`
  - Sends a branded email (using existing `buildEmail`/`sendEmail` from `_shared/email-layout.ts`) with:
    - Android instructions: "Open the app in Chrome → tap Install or Menu → Add to Home Screen"
    - iOS instructions: "Open in Safari → tap Share → Add to Home Screen"
    - A CTA button linking to the published app URL
- Respects notification preferences (skips in-app if operator disabled notifications)
- Idempotent: checks if a `pwa_install` notification already exists for each user to prevent duplicates on re-run

**2. Trigger: One-time manual invocation**
- Staff/management can trigger it from the Management Portal, or it can be invoked once via the edge function test tool after deployment
- No recurring schedule needed — this is a one-time announcement

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/notify-pwa-install/index.ts` | New — edge function that broadcasts in-app + email notifications to all active operators |

### After deployment
The function will be invoked once to send the announcement to all 41 active operators. Each operator gets a bell notification and an email with step-by-step install instructions.

