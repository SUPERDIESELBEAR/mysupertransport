## Why the button is broken

The `notify-pwa-install` edge function builds the CTA href from the raw `APP_URL` environment variable:

```ts
const APP_URL = Deno.env.get('APP_URL') || 'https://mysupertransport.lovable.app'
...
{ label: 'Open SUPERDRIVE', url: APP_URL }
```

Every other email in the project routes through `supabase/functions/_shared/app-url.ts → buildAppUrl()`, which sanitizes the env var (adds missing `https://`, rejects bare IPs / localhost / non‑HTTP values, and falls back to `https://mysupertransport.lovable.app`). That helper was added specifically to stop bad `APP_URL` values from leaking into emails.

This one function never got migrated, so when `APP_URL` is set to a value that isn't a usable absolute URL (e.g. a bare host, missing scheme, or an unreachable preview value), the `<a href="…">` ends up with that bad value and Gmail/Outlook either won't link it or sends it to a dead address. That's the email you received.

## Fix

1. **`supabase/functions/notify-pwa-install/index.ts`**
   - Import `buildAppUrl` from `../_shared/app-url.ts`.
   - Replace the local `APP_URL` constant and the CTA so the button URL is `buildAppUrl('/')`.
   - No copy / layout changes.

2. **`src/lib/pwaReminderContent.ts`** (staff preview modal)
   - Keep in sync: the preview already hardcodes `https://mysupertransport.lovable.app`, which is what the sanitized URL resolves to in production, so the preview will continue to match the real email. No change needed unless we later want the preview to read from an env value.

3. **Deploy** the `notify-pwa-install` edge function after the edit so the next reminder (manual or cron) uses the fixed URL.

4. **Verify**
   - Re-send the reminder to a test driver from the staff UI.
   - Inspect the received email's "Open SUPERDRIVE" anchor — `href` must be `https://mysupertransport.lovable.app/` (or the correctly sanitized custom domain).
   - Click it and confirm it opens the app.

5. Bump `public/version.json`.

No DB, schema, UI, or business-logic changes — purely a one-line URL-build fix in the edge function.
