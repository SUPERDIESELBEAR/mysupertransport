# Streamline the "Approved & Invited" → Installed → Onboarding Flow

## What's happening today (current flow)

1. Staff clicks **Approve & Invite** in the Application Review drawer.
2. `invite-operator` edge function fires:
   - Sends Supabase auth invite email → link goes to **`/welcome`** with an access token in the URL hash.
   - Fires a **second** email (`notify-pwa-install`) telling them how to install the PWA.
3. Applicant gets two emails back-to-back, often opens the install email first, lands on the marketing site, taps "Install" before logging in, ends up in a broken state.
4. `WelcomeOperator` requires the access token from the invite email hash — if they tap the install email link first or the token expires, they get a token error.
5. After installing, the PWA opens at `/` (`start_url` in `manifest.json`) which routes to the splash page, not the user's portal.

## Why people are seeing a blank white page

After auditing `WelcomeOperator.tsx`, `InstallApp.tsx`, `manifest.json`, `main.tsx`, and the two edge functions, the blank page is caused by a combination of three real issues:

1. **`manifest.json` has `"start_url": "/"`** — when an applicant installs the PWA from the invite link page, the installed app launches at `/` (splash), losing their auth context. The install banner and `/install` page both inherit this. If the installer was on `/welcome` with a hash token, the token is dropped on launch and they land on splash with no session — appears blank if their browser was mid-redirect.
2. **Two separate emails compete.** The "Install SUPERDRIVE" email goes out *at the same time* as the invite email and links to `APP_URL` (root). Applicants click it first, install the app, but never consume the auth invite token → they're stuck logged-out with no obvious next step.
3. **Service worker is force-unregistered in `main.tsx`** for any host containing `lovableproject.com` — the published domain `mysupertransport.lovable.app` is **not** matched, so that's fine, but the install banner only shows on non-iframe non-preview hosts. There's no install path inside the welcome flow itself.

## Proposed streamlined flow

```text
Approve & Invite (staff)
        │
        ▼
ONE email: "Welcome to SUPERTRANSPORT — Get Started"
   ├─ Big CTA: "Set Up Your Account" → /welcome?token=...
   └─ Below CTA: "📱 Install the SUPERDRIVE app" with platform-specific 1-line tip
        │
        ▼
/welcome  (mobile-optimized, single-screen)
   1. Verify invite token → set password
   2. After password set: "Add SUPERDRIVE to your home screen" step
        ├─ Android: native install button (beforeinstallprompt)
        └─ iOS: animated Share → Add to Home Screen instructions
   3. "Open SUPERDRIVE" → routes to /dashboard
        │
        ▼
PWA installed, launches directly at /dashboard (or /login if session expired)
```

## Concrete changes

### 1. Fix the blank-page root cause
- **`public/manifest.json`**: change `"start_url": "/"` → `"start_url": "/dashboard"` so the installed app opens the operator portal (which redirects to `/login` if no session — never blank).
- Add `"scope": "/"` and a `?source=pwa` query param to start_url for analytics.

### 2. Consolidate to a single invitation email
- **Remove** the fire-and-forget `notify-pwa-install` call from `invite-operator/index.ts` (lines 363–372).
- **Update** the existing Supabase auth invite email template (or `auth-email-hook` if scaffolded) to include:
  - Primary CTA: **"Set Up Your Account"** (the existing `/welcome` magic link)
  - Secondary section: **"After signing in, we'll help you install the app on your phone"** — keep install instructions inside the app, not the email.
- Keep `notify-pwa-install` for the bulk re-engagement use case (existing operators), but stop firing it on first invite.

### 3. Bake the install step into `/welcome`
After password creation succeeds in `WelcomeOperator.tsx`, instead of jumping straight to `/dashboard` after 3s, show a new **Step 2: Install the App** card:
- Detect platform (iOS / Android / desktop) using existing helpers from `InstallApp.tsx`.
- **Android/Desktop**: capture `beforeinstallprompt` and show a single big **"Install SUPERDRIVE"** button.
- **iOS Safari**: show 3-step animated visual (Share icon → "Add to Home Screen" → Add).
- Below the install card: **"Skip for now → Continue to Portal"** so it's never a hard block.
- Detect `display-mode: standalone` and auto-skip the install step if already installed.

### 4. Make `/welcome` link more resilient to "blank page"
- Token-error fallback already exists (resend invite form) — verify it renders before any blank state.
- Add a top-level error boundary on the `/welcome` route so a JS error during hash processing shows a "Resend invite" UI instead of a white screen.
- Add `console.log` breadcrumbs at each step (`hash detected`, `session ready`, `password updated`) so future blank-page reports surface in the console logs we can inspect.

### 5. Add a recovery path for already-installed users
- If `/welcome` loads inside an installed PWA but the hash token was dropped during launch (Android quirk), show: **"Open the invite link in your browser, not the installed app"** with a tap-to-copy URL.

## Technical notes

- Files touched (build phase, after approval):
  - `public/manifest.json` — start_url
  - `supabase/functions/invite-operator/index.ts` — remove `notify-pwa-install` fire
  - `supabase/functions/_shared/email-templates/invite.tsx` (if auth email templates exist) or the auth invite flow — append install section
  - `src/pages/WelcomeOperator.tsx` — add post-password install step + error boundary
  - `src/pages/InstallApp.tsx` — extract reusable `<InstallStep />` component shared with `/welcome`
- No DB migration required.
- No new edge functions; we are *removing* one redundant call.

## What this fixes

| Problem today | After change |
|---|---|
| Two emails, applicants click the wrong one | One email with one CTA |
| Install email links to root → not logged in → blank/splash | Install happens *inside* the authenticated welcome flow |
| `start_url: "/"` drops auth context on PWA launch | `start_url: "/dashboard"` lands them in their portal |
| White screen on token error | Error boundary + resend form always renders |
| No visible install affordance after login | Built into welcome step 2, plus existing `/install` page kept as backup |

Approve and I'll implement.