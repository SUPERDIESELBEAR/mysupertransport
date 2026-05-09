---
name: Preview as Operator (deferred)
description: Deferred enhancement to PwaReminderPreviewModal — personalize in-app + email preview with operator name and binder link
type: feature
---
**Status:** Deferred 2026-05-09 — not rejected, revisit later.

**Idea:** Add an operator picker / toggle to `src/components/management/PwaReminderPreviewModal.tsx` so staff can preview the personalized in-app notification and email for a specific operator instead of the current generic version.

**Tokens considered:**
- `{{first_name}}` — `applications.first_name` (fallback `contractor_pay_setup.legal_first_name`)
- `{{full_name}}` — first + last
- `{{unit_number}}` — `onboarding_status.unit_number` or `operators.unit_number`
- `{{binder_link}}` — `${APP_URL}/operator?tab=inspection-binder`
- `{{coordinator_name}}` — `profiles` of `operators.assigned_onboarding_staff`
- `{{support_email}}` — constant

**Scope options:**
- *Light:* `first_name` + `binder_link` only.
- *Full:* all tokens above.

**Architecture note:** Add `renderPwaReminder(operator?)` to `src/lib/pwaReminderContent.ts` returning `{ inAppTitle, inAppBody, emailSubject, emailHeading, emailHtml }`. Mirror the same merge logic in `supabase/functions/notify-pwa-install/index.ts` (Deno cannot import from `src/`) so preview output is byte-identical to what is sent.

**Recommendation:** Apply personalization to both the preview AND the real send — otherwise the preview misleads.

**Out of scope:** SMS channel, cadence changes, hard Drive cutoff date.