# Fix QPassport email download + operator header overlap

## Problem 1 — Email button still routes through the portal

Today the email CTA points at `/operator?tab=progress&action=download-qpassport`. That requires the user to be authenticated, the SPA to load, the operator record to fetch, and only then can it trigger a download. On mobile especially, this lands on the portal and the auto-download often never fires. We need a link that downloads the PDF directly — no login, no SPA.

## Solution — public tokenized download endpoint

Create a new public edge function `download-qpassport` that streams the operator's QPassport PDF straight back to the browser as an attachment. The email CTA points directly at this URL.

### New edge function: `supabase/functions/download-qpassport/index.ts`

- Public (no JWT required); add to `supabase/config.toml` with `verify_jwt = false`.
- Accepts `GET /download-qpassport?token=...`.
- `token` is an HMAC-signed payload `{ operator_id, exp }` (7-day expiry) using a new secret `QPASSPORT_DOWNLOAD_SECRET`. Sign with `crypto.subtle` HMAC-SHA256, base64url-encoded.
- On request: verify HMAC + expiry. Use the service role client to load `onboarding_status.qpassport_path` (and bucket name) for the operator. Download the file bytes from storage and return them with:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="QPassport.pdf"`
- Friendly HTML error page if token invalid/expired with a button to open the portal.

### Email CTA changes

- `supabase/functions/send-notification/index.ts` (`qpassport_uploaded` case): mint a token, build the URL `${SUPABASE_URL}/functions/v1/download-qpassport?token=...`, and use it as the CTA `url`. Keep subject/heading/body copy unchanged.
- `supabase/functions/send-test-email/index.ts`: same change so test sends mirror prod.
- Remove the now-obsolete `action=download-qpassport` query handling in `OperatorStatusPage.tsx` (the manual button on the portal still works for re-downloads).

### Redeploy

Deploy `download-qpassport`, `send-notification`, `send-test-email`. Send a fresh test to `emma@mysupertransport.com` to confirm tapping the gold button downloads `QPassport.pdf` directly with no portal hop.

## Problem 2 — Logo overlaps "My Progress" in desktop header

At ~1023px the logo's right edge sits on top of the first nav item. Root cause: the header's inner container is `max-w-4xl` (896px) but the desktop nav has 9 items plus a 180px-wide logo and the avatar cluster — they don't fit.

### Fix in `src/pages/operator/OperatorPortal.tsx` (header block ~line 938)

- Widen the header container from `max-w-4xl` to `max-w-7xl` so the nav has room to breathe on laptop/desktop.
- Tighten the logo cap from `max-w-[180px] h-10` to `max-w-[140px] h-9` so it never crowds the first nav item at narrow desktop widths.
- No mobile changes (the desktop nav is already `hidden md:flex`).

## Verification

- Visit `/operator` at 1024px and 1280px viewports — confirm no overlap between logo and nav.
- Send QPassport test email → tap CTA in an unauthenticated browser → PDF downloads, no portal redirect.
- Tap CTA while logged in → still downloads (token-based, auth-agnostic).
