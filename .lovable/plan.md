## Goal

Turn the existing `/install` route into a polished, shareable install guide that support can text or email to anyone (operator, applicant, or stuck Gmail-webview user) — and link to it from the invite email and the install banner so it becomes the single source of truth.

## Why

- `/install` already exists and is public, but nothing links to it externally.
- The invite email hardcodes install steps inline — when those steps change, every previously-sent email is stale.
- The PWA banner currently opens an inline modal, duplicating the same content with no shareable URL for support.
- Users stuck in Gmail/Facebook webviews need a top-of-page "Open in Safari" prompt before any other instruction is useful.

## Scope

### 1. Harden `/install` for external visitors
File: `src/pages/InstallApp.tsx`

- Replace the "Back" button (which calls `navigate(-1)` and breaks for cold visitors with no history) with a "Go to login" link.
- Replace the `onContinue` → `/dashboard` handler with logic that goes to `/dashboard` if signed in, otherwise `/login`.
- Add an in-app-browser warning block ABOVE the steps (using `isInAppBrowser()` from `src/lib/pwa.ts`) with:
  - Plain-language explanation: "You're viewing this inside the Gmail app. To install SUPERDRIVE you need Safari."
  - A "Copy install link" button (uses existing `copyToClipboard` helper) prefilled with the canonical `https://mysupertransport.lovable.app/install` URL.
  - Step: "Tap the ⋯ menu in Gmail → Open in Safari → return to this page."
- Show a subtle success state when already installed (uses existing `isStandalone()`).

### 2. Link to the guide from the invite email
File: `supabase/functions/_shared/email-templates/invite.tsx`

- Add a secondary CTA button under the existing "Set Your Password" button: **"View the install guide →"** linking to `https://mysupertransport.lovable.app/install`.
- Keep the inline iPhone/Android cards (they're useful at-a-glance), but add a one-line note above them: "Stuck? Tap the install guide for step-by-step help and screenshots."
- Redeploy the email layer (templates are baked into the auth-email-hook).

### 3. Point the PWA banner at the route instead of the modal
File: `src/components/PWAInstallBanner.tsx`

- On iOS, the banner tap currently opens an inline modal. Change it to navigate to `/install` instead — single source of truth, easier to iterate, and works the same whether the user is signed in or not.
- Keep the Android `beforeinstallprompt` flow unchanged (native prompt is still preferred there).

### 4. Memory
Add a short `mem://features/install-guide-route.md` entry so future sessions know:
- `/install` is the canonical public install guide,
- the invite email links to it,
- the PWA banner routes there on iOS.

## Out of scope

- No service worker / vite-plugin-pwa changes (manifest stays as-is).
- No changes to the Android install flow.
- No new translations or marketing copy beyond what's needed for clarity.

## Technical notes

- `/install` is already in the public routes block of `src/App.tsx` — no router change needed.
- All in-app-browser detection reuses `src/lib/pwa.ts` (already added in the previous round).
- The canonical URL is the published domain (`https://mysupertransport.lovable.app`), not the preview URL — emails go to real users.
- Email template change requires redeploying `auth-email-hook` so the new HTML is served.

## Files to change

- `src/pages/InstallApp.tsx` (rewrite for cold-visit + in-app-browser warning)
- `src/components/PWAInstallBanner.tsx` (iOS tap → `/install` route instead of modal)
- `supabase/functions/_shared/email-templates/invite.tsx` (add guide link + helper note)
- `mem://features/install-guide-route.md` (new memory)
- Redeploy `auth-email-hook` after email template edit
