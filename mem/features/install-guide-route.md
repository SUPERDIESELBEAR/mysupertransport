---
name: Install guide route
description: Public /install route is the canonical PWA install guide; linked from invite email and PWA banner
type: feature
---
- Route: `/install` in `src/App.tsx` is in the PUBLIC routes block — reachable without auth.
- Page: `src/pages/InstallApp.tsx` wraps `InstallStep` with cold-visitor friendly chrome (no `navigate(-1)`; "Sign in" / "My portal" link in header).
- In-app browser handling lives in `InstallStep.tsx` and reuses helpers from `src/lib/pwa.ts` (`isInAppBrowser`, `copyToClipboard`).
- Invite email (`supabase/functions/_shared/email-templates/invite.tsx`) links to `${siteUrl}/install` via secondary CTA. After editing the template, redeploy `auth-email-hook`.
- `PWAInstallBanner.tsx` no longer renders an inline modal — iOS taps navigate to `/install` (single source of truth). Android still uses native `beforeinstallprompt`.
- Canonical public URL: `https://mysupertransport.lovable.app/install`.
