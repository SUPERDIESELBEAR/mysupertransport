

## Add "Send by Email" to Staff Resource Library

### What it does
Adds a staff-side email action so coordinators can email any resource file directly to an operator or any custom email address — using the existing Resend email infrastructure.

### Changes

**1. New Edge Function: `send-resource-email`**

A lightweight edge function that:
- Accepts `{ resourceTitle, resourceUrl, recipientEmail, recipientName?, senderNote? }`
- Validates inputs
- Builds a branded email using the existing `buildEmail` / `sendEmail` helpers with a download CTA linking to the public `resource-library` URL
- Sends via Resend (key already configured)

**2. Update `supabase/config.toml`**

Add `[functions.send-resource-email]` with `verify_jwt = false`.

**3. Update `ResourceLibraryManager.tsx`**

- Add a `Mail` icon button to each resource row (next to Preview, History, Edit, Delete)
- Clicking it opens a small dialog with:
  - A dropdown to select an operator (fetched from `operators` joined with `applications` for name/email) **or** a free-text email input for "someone else"
  - An optional note field
  - Send button
- On send, calls the edge function via `supabase.functions.invoke('send-resource-email', { body: ... })`
- Shows success/error toast

### Files Modified
| File | Change |
|------|--------|
| `supabase/functions/send-resource-email/index.ts` | New edge function — branded email with file download link |
| `supabase/config.toml` | Add function config block |
| `src/components/management/ResourceLibraryManager.tsx` | Add Mail button + send dialog with operator picker / custom email input |

