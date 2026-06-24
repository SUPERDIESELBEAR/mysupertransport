## Plan: "Open QPassport" — view inline AND auto-download

Yes — we can do both: open the PDF in the browser for viewing, while the file simultaneously downloads to the user's device.

### Approach

Replace the forced-download endpoint with a tiny HTML "viewer" page that:
1. **Displays the PDF inline** in a full-height `<iframe>` (browsers render the PDF using their built-in viewer — works on desktop Chrome/Edge/Safari/Firefox and mobile Safari/Chrome).
2. **Triggers an automatic download** of the same PDF on page load via a hidden `<a download>` click.
3. Shows a header bar with a manual **"Download"** button as a fallback (some mobile browsers block auto-download).

The PDF itself is served from the same function with a `mode` query param — one signed token covers both inline and attachment delivery.

### Changes

**`supabase/functions/download-qpassport/index.ts`** — turn the single endpoint into a small router:
- `GET /?token=…` (what the email link points to) → returns the HTML viewer page (iframe + auto-download script + header with Download button + "Open My Portal" link).
- `GET /?token=…&mode=inline` → returns the PDF bytes with `Content-Disposition: inline; filename="QPassport.pdf"` (used by the iframe `src`).
- `GET /?token=…&mode=attachment` → returns the PDF bytes with `Content-Disposition: attachment; …` (used by the hidden auto-download link and the header "Download" button).
- Token validation, expiry check, and storage lookup are extracted into one helper used by all three modes. Error pages stay as-is.

**`supabase/functions/send-notification/index.ts`** — change the email CTA label:
- Update CTA from `{ label: 'Download My QPassport' }` to `{ label: 'Open QPassport' }`.
- Adjust body copy: "…available to open and download in your portal" / "open and download your QPassport".

**`supabase/functions/send-test-email/index.ts`** — same two copy edits so the staff test email matches production.

### Viewer page layout

```text
┌─────────────────────────────────────────────┐
│  QPassport          [ Download ] [ Portal ] │  ← sticky header, dark theme, gold buttons
├─────────────────────────────────────────────┤
│                                             │
│      <iframe src="?token=…&mode=inline">    │  ← fills viewport, native PDF viewer
│                                             │
└─────────────────────────────────────────────┘
```

- Inline `<script>` on load creates an `<a href="?token=…&mode=attachment" download>` and `.click()`s it once. Wrapped in `try/catch`; failures are silent (header Download button is the fallback).
- Styling matches existing `errorPage`: bg `#0D0D0D`, card `#1a1a1a`, gold `#C9A84C` buttons.

### Out of scope
- No DB changes, no new secrets, no portal UI changes.
- Token format/secret stays identical — already-sent email links continue to work and will now open the viewer.
- Push-notification copy stays as-is.

### After build — send you a test email

I will trigger the existing `send-test-email` edge function so the real "Your QPassport is Ready" email lands in your inbox with the new viewer behavior. **I need your email address to send it to** — please reply with it (or confirm to send to the email on your logged-in account).

### How to verify
1. Open the test email → click **"Open QPassport"**.
2. Expect: a browser tab opens with the PDF rendered inline AND `QPassport.pdf` appears in your Downloads folder.
3. Click **"Download"** in the viewer header → expect a fresh download.
