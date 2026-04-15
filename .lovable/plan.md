

## Fix Driver's License Link in Insurance Email

### Problem
The DL link in the insurance email uses a raw storage path (e.g. `application-documents/abc/dl.jpg`) instead of a full URL. When the recipient clicks it, the browser interprets it as a domain name — resulting in `DNS_PROBE_FINISHED_NXDOMAIN`.

### Solution
**Attach the driver's license image directly to the email** instead of linking to it. This is the most reliable approach because:
- Signed URLs expire (typically 1 hour) — useless if the insurance agent opens the email later
- An attachment is a permanent copy the recipient can save and reference anytime

### Changes

**`supabase/functions/send-insurance-request/index.ts`**

1. **Download the DL image from storage** — After fetching `app?.dl_front_url`, use the service-role Supabase client to download the file as a `Uint8Array`, then Base64-encode it.

2. **Pass the attachment to Resend** — The Resend API accepts a `attachments` array with `{ filename, content }` (Base64-encoded). Add the DL image as an attachment when available.

3. **Update the email template** — Replace the broken `<a href="...">View Driver's License</a>` link with a note: "Driver's license attached" (or keep the "No driver's license on file" fallback).

4. **Also check `operator_documents`** — If `dl_front_url` is null in `applications`, look for a document with `doc_type = 'drivers_license'` in `operator_documents` as a fallback (covers licenses uploaded during onboarding).

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Download DL from storage, attach to email via Resend API, update email template text |

