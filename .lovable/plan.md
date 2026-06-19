Fix the "View My Portal" button in the Drug Screening Scheduled email so it's reliably clickable, and point it to the right place in the portal.

## Root Cause
The button is rendered in `supabase/functions/_shared/email-layout.ts` as a `<div>` containing an `<a>` styled with `display:inline-block` and padding, with whitespace/newlines wrapping the label text. iOS Gmail (and a few other mobile clients) intermittently fail to treat that padded inline-block anchor as a tap target — the button looks correct but taps don't register. This is a known mobile-email rendering quirk; the industry standard fix is the "bulletproof button" pattern (table + anchor with padding inside the anchor, no surrounding whitespace).

This isn't drug-screening-specific — every milestone email uses the same shared CTA renderer — but fixing the renderer once repairs all of them, including this one.

## What
1. Rewrite the CTA in `supabase/functions/_shared/email-layout.ts` as a bulletproof, table-based button:
   - `<table role="presentation">` wrapper centered with `margin:0 auto`
   - Single `<td>` with the gold background and rounded radius
   - `<a>` inside with `display:block`, `padding:14px 32px`, `target="_blank"`, `rel="noopener"`, and no whitespace/newlines between the opening/closing anchor tags and the label
   - Keep the existing brand color/typography
2. Update the `drug_screening_scheduled` CTA URL in `supabase/functions/notify-onboarding-update/index.ts` from `${appUrl}/dashboard` → `${appUrl}/dashboard?tab=progress` so the driver lands directly on their onboarding progress view (which shows their current drug-screening stage), instead of the generic portal home.

## Where the button will go after fix
`https://mysupertransport.lovable.app/dashboard?tab=progress` — the operator's onboarding progress view, where drug screening status is shown in context. The `/dashboard` route already routes operators to the Operator Portal, and the portal already honors the `?tab=` deep-link param on mount.

## Out of scope
No backend schema changes. No changes to other milestone copy or other email functions. Other milestone emails will automatically inherit the bulletproof button fix since they all share `buildEmail()`.