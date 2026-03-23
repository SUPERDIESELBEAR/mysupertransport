
## Migrate 2 remaining edge functions to shared email layout

### What changes

**`check-cert-expiry/index.ts`**
- Remove lines 8–70 (local `buildEmail` + `sendEmail` functions)
- Add `import { buildEmail, sendEmail } from '../_shared/email-layout.ts';` at top
- No call-site changes needed — signatures match exactly (both return `void`)

**`notify-document-update/index.ts`**
- Remove lines 8–87 (local `buildEmail` + `sendEmail` functions + `sleep` helper)
- Add `import { buildEmail, sendEmail } from '../_shared/email-layout.ts';` at top
- Keep `sleep` as a local helper (it is unrelated to email, used for Resend rate-limit throttling)
- The local `sendEmail` returned `boolean` and the calling loop uses `ok ? sent++ : failed++`. Replace with a `try/catch` wrapping the shared `sendEmail` (which returns `void`) — same outcome, same counts

### Visual output
Zero changes. Both functions use `support@mysupertransport.com` in the footer and `onboarding@` as the sender, which are the exact defaults in the shared helper. HTML output is byte-for-byte identical.

### Files changed
1. `supabase/functions/check-cert-expiry/index.ts`
2. `supabase/functions/notify-document-update/index.ts`

After this, all 9 email-sending edge functions draw from the single `_shared/email-layout.ts` source of truth.
