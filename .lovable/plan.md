## Option B: Structured formatting + short links

### 1. Database (one migration)

New table `public.document_short_links`:
- `code text PRIMARY KEY` — 8-char lowercase hex
- `share_token text NOT NULL UNIQUE` — points to the existing `/inspect/{token}` token
- `created_at`, `created_by`

Access rules:
- Anyone (including anon) can read the table so `/s/{code}` resolves without a login. The underlying inspect token remains the real security boundary and already expires.
- No direct inserts — a security-definer RPC `get_or_create_short_link(_share_token)` mints codes and requires `auth.uid()` (drivers/staff only).

### 2. Public redirect route

New file `src/pages/ShortLinkRedirect.tsx` mounted at `/s/:code` in `src/App.tsx`:
- Selects `share_token` for the code, then `Navigate` to `/inspect/{token}` (existing `InspectionSharePage`).
- Renders "Not found" if the code is unknown.

Final short URL: `https://mysupertransport.lovable.app/s/ab12cd34`.

### 3. Share formatter

New file `src/lib/binderShareFormat.ts` exports `buildShareBodies({ items, driverName, unitNumber, channel, source })` returning `{ subject, body }`:
- `channel: 'email' | 'sms'`
- Email: subject `SuperTransport — {Driver} — {Doc}` (single) or `SuperTransport — Roadside Documents for {Driver} (Unit {###})` (multi). Body has greeting, numbered list (title on its own line, URL below), and a footer with US-Central timestamp + sender label.
- SMS ≤3 items: bullet list, title above URL, blank line between.
- SMS >3 items: single-line summary + one cover-share URL (already exists for the binder cover).
- All URLs passed in are already resolved short links.

### 4. Wire into `BinderFlipbook.tsx`

- Add `resolveShortUrl(shareToken)` helper that calls the RPC and falls back to the full `/inspect/{token}` URL on error.
- Convert `shareCurrentEmail`, `shareCurrentText`, `shareSelectedEmail`, `shareSelectedText`, `shareAllEmail` to async: resolve short URLs for every item (in parallel), pass results to `buildShareBodies`, then open `mailto:`/`sms:`.
- Uploads (no share token, ephemeral signed URL) continue to use the full URL — no code minted for those.
- QR data still uses the full inspect URL (QR size is not a concern and avoids a network call before showing the QR).

### 5. No changes to
- Existing `/inspect/{token}` route, `inspection_documents` table, PEI/other share flows, or edge functions.

### Verification

- Send single-doc email → subject "SuperTransport — Driver — CDL (Front)", body has one link on its own line with footer.
- Send 3-doc SMS → bulleted, short `/s/...` URLs, no title/URL collisions.
- Send all-docs (>3) SMS → falls back to a single cover URL.
- Visit `/s/{code}` in a fresh browser → lands on the existing inspect viewer.
- Bad code at `/s/xxxx` → "Link not found" state.
