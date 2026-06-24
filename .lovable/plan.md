## Plan: Move QPassport viewer to an app route (fixes both issues)

### Why
- The edge-function URL `…supabase.co/functions/v1/download-qpassport?token=…` is being displayed as raw text by your Chrome (likely the Gemini/Ask Gemini extension visible in your tabs is intercepting unknown edge-function origins, or Chrome's safe-browsing heuristic). The function itself returns the correct `Content-Type: text/html` — confirmed by curl.
- The auto-download script can't trigger a cross-origin download via the `<a download>` attribute (browser security — Chrome ignores `download` when the href is a different origin). Same-origin app code can fetch the bytes as a blob and download reliably.

Moving the viewer into the app solves both: rendered by your trusted app domain (`mysupertransport.lovable.app`), and same-origin to the React code that issues the download.

### Changes

**1) New app route — `src/pages/QPassportView.tsx`** (lazy-loaded in `src/App.tsx` as `/qpassport/view`):
- Reads `token` query param.
- Renders a dark page matching the existing viewer layout: sticky header (title "QPassport" + Download + Open My Portal buttons), and an `<iframe>` filling the rest.
- On mount:
  1. `fetch(downloadQpassportUrl + "?token=" + token + "&mode=inline")` → blob → `URL.createObjectURL` → set as iframe `src` (renders PDF in the native viewer, same-origin to the iframe).
  2. `fetch(downloadQpassportUrl + "?token=" + token + "&mode=attachment")` → blob → `URL.createObjectURL` → synthetic `<a download="QPassport.pdf">` click → triggers a real download.
  3. Header "Download" button re-runs step 2.
- Error state: if either fetch fails (expired link, missing file), show the existing dark error card with portal button — read JSON or HTML error and surface a clean message.
- Cleanup: `URL.revokeObjectURL` on unmount.

**2) Edge function — `supabase/functions/download-qpassport/index.ts`**:
- Default route (`mode` not set) → keep current viewer page as a **fallback** so already-sent emails still work, but also detect and redirect any browser request to the new app route via a 302 to `https://mysupertransport.lovable.app/qpassport/view?token=…`. Simpler approach: always 302 when `mode` is absent. This means old and new emails both end up on the app route.
- `mode=inline` and `mode=attachment` continue to stream PDF bytes (unchanged), used by the new app page's fetches.
- Ensure CORS allows `GET` from `https://mysupertransport.lovable.app` (already permissive `*`).

**3) Email link target — `supabase/functions/_shared/qpassport-link.ts`** (and any caller):
- Update `buildQPassportDownloadUrl(operatorId)` to return `https://mysupertransport.lovable.app/qpassport/view?token=<token>` directly, instead of the edge-function URL. New emails get the app URL; old emails get the 302 from the edge function, so both work.

### Verification (after build)
1. Re-invoke `send-test-email` with `{ "operator_email": "emmafmueller@gmail.com", "to": "emma@mysupertransport.com" }`.
2. Open the new email → "Open QPassport" link goes to `mysupertransport.lovable.app/qpassport/view?token=…`.
3. Expect: app page renders with QPassport in iframe AND `QPassport.pdf` lands in Downloads automatically.
4. The header "Download" button re-downloads on click.

### Out of scope
- No DB changes, no auth changes, no template structural rewrite.
- Token format and HMAC unchanged.
