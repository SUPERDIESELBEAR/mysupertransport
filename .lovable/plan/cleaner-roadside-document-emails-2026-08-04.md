# Cleaner Roadside Document Emails

## Why the emails look unstructured today

The binder share uses a `mailto:` link, so the whole message is plain text. Mail clients (Gmail, Apple Mail, Outlook) reflow plain text — they collapse the line breaks and divider rules, so the carefully numbered list arrives as one run-on paragraph with raw 60-character URLs wrapping mid-word. Nothing is broken; plain text simply cannot hold a layout.

## Recommendation

Send the share as a real branded HTML email from the backend instead of handing a text blob to the phone's mail app. That gives:

- A SUPERTRANSPORT gold header, with driver name and unit as a clean subheading.
- Each document as its own row with a **View** button — no naked URLs in the body at all.
- A compact facts block (driver, unit, shared at, link expiry) instead of trailing text lines.
- Identical layout for 1 document or 9; the bulk case just gets more rows.
- Correct rendering on iPhone Mail, Gmail app, and Outlook.

## What gets built

1. **New edge function `send-binder-share`**
   - Input: recipient email, driver name, unit, and the list of `{ title, shareToken }` items.
   - Verifies the caller is the driver (or staff) and that each token belongs to that driver's binder before sending.
   - Resolves short links server-side, renders the HTML, sends through the existing email sender.

2. **New shared template** in `supabase/functions/_shared/`, reusing the existing brand constants (gold `#C9A84C`, dark `#0F0F0F`) so it matches the PEI and auth emails:
   - Header bar, "Roadside Documents" title, one-line intro.
   - Document rows: numbered title on the left, gold **View** button on the right.
   - Footer note that links are secure and time-limited, plus "Powered by SUPERDRIVE".

3. **Binder flipbook UI change** (`BinderFlipbook.tsx`)
   - "Share by Email" opens a small sheet asking for the officer/recipient email, then calls the function and shows a "Sent" confirmation.
   - If the send fails or the device is offline, fall back to the current `mailto:` flow so a driver at roadside is never blocked.

4. **Tighten the plain-text fallback** in `binderShareFormat.ts` so even the fallback reads cleanly after reflow: drop the divider rules, keep title and URL together, keep the numbering.

Text (SMS) sharing stays as-is — the bulleted short-link format already works there.

## Technical notes

- Files touched: new `supabase/functions/send-binder-share/index.ts`, new `_shared/binder-share-email.ts`, `src/components/inspection/BinderFlipbook.tsx`, `src/lib/binderShareFormat.ts`.
- Reuses `get_or_create_short_link` so emailed URLs are short `/s/<code>` links, not full UUID paths.
- Sender: the existing verified SUPERTRANSPORT domain; no new domain setup needed.