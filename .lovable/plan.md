## Deep-link the "Review Application" email button to the specific applicant

The Applications page already supports `?view=applications&app=<id>` — the drawer opens automatically when that param is present (see `src/pages/management/ManagementPortal.tsx` lines 220–234). The email just isn't passing the applicant id.

**Changes:**

1. `src/pages/ApplicationForm.tsx` — after insert, include the new application's `id` in the `new_application` notification payload as `application_id`.
2. `src/components/management/StaffApplicationModal.tsx` — same: pass `application_id` in the `new_application` payload.
3. `supabase/functions/send-notification/index.ts` — in the `new_application` case, read `payload.application_id` and build the CTA URL as `${appUrl}/management?view=applications&app=<id>` when present; fall back to `${appUrl}/management?view=applications` when missing (older callers).

**Result:** Clicking "Review Application" in the email lands directly on the Applications list with that applicant's pending review drawer open on the right — matching the second screenshot.