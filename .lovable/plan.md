## Goal

Give staff a way to push a submitted application back to the applicant for corrections (e.g. missing employers), with a clear audit trail and a secure one-time link emailed to the applicant.

## What exists today

- `applications.review_status` enum: `pending | approved | denied`.
- `applications.is_draft` boolean — when true, the applicant can resume and edit.
- `application_resume_tokens` table + `request-application-resume` / `consume-application-resume` edge functions already power the "resume my draft" flow from the splash page (24h, single-use token emailed to the applicant).
- Review drawer (`ApplicationReviewDrawer.tsx`) only exposes **Approve** and **Deny** today.

We can reuse the existing token + resume infrastructure — we just need a staff-initiated path that flips the application back to draft and emails the link with a "revisions requested" message.

## Plan

### 1. Database (migration)

- Add a new value `revisions_requested` to the `review_status` enum.
- Add columns on `applications`:
  - `revision_requested_at timestamptz`
  - `revision_requested_by uuid` (staff user id)
  - `revision_request_message text` (what needs to be fixed — shown to applicant)
  - `revision_count int default 0`
- No RLS changes needed; existing staff policies on `applications` already cover updates.

### 2. New edge function: `request-application-revisions`

Inputs: `{ applicationId: string, message: string }` (staff-authenticated).

Behavior:
1. Verify caller is staff (recruiter/admin/owner) via `getClaims` + `has_role`.
2. Load application; require current `review_status` to be `pending` (or allow re-request when already `revisions_requested`).
3. Update the application:
   - `is_draft = true`
   - `review_status = 'revisions_requested'`
   - `submitted_at = null` (so it leaves the pending queue)
   - `revision_requested_at = now()`, `revision_requested_by = caller`, `revision_request_message = message`
   - `revision_count = revision_count + 1`
   - Append to `reviewer_notes` with timestamp + staff name + message.
4. Generate a resume token (same shape as `request-application-resume`, 7-day expiry for revisions vs 24h for self-serve).
5. Email the applicant via Resend using the existing `buildEmail` layout. Subject: "Action needed: please update your {BRAND_NAME} application." Body shows the staff message verbatim, plus the resume button.
6. Return generic success.

### 3. Applicant resume flow

- `consume-application-resume` already returns the `draft_token` and lets the applicant re-enter the form. No change required — the existing form will load all prior answers so they only fix what's needed.
- On submit, the form already sets `is_draft = false`, `submitted_at = now()`, `review_status = 'pending'` — which naturally moves it back into the staff pending queue. Verify that path in `ApplicationForm.tsx` handles a record whose previous status was `revisions_requested` (just need to also clear `revision_request_message` is optional; we'll keep it for history).

### 4. Staff UI (`ApplicationReviewDrawer.tsx`)

- Add a third action button in the footer (visible when `review_status === 'pending'`): **Request Revisions** (outline, neutral color), alongside Deny and Approve.
- Clicking it opens a confirm panel (same pattern as approve/deny) with a **required** textarea: "Tell the applicant what to fix (they will see this message)." Min 10 chars.
- On confirm: call `request-application-revisions` edge function, toast success, close drawer, refresh list.
- When the drawer is opened on an application with `review_status === 'revisions_requested'`:
  - Show a banner at the top: "Revisions requested {date} by {staff}. Awaiting applicant updates." with the message shown.
  - Hide the action footer (no actions until applicant resubmits).

### 5. Pipeline / list views

- `STATUS_COLORS` map: add `revisions_requested: 'bg-status-progress/15 text-status-progress'` (amber).
- Wherever staff list applications (Pipeline dashboard, application lists), include the new status in filters and badges so these don't disappear from view. Show count of pending revisions as its own bucket.

### 6. Applicant-side polish (optional, recommended)

- On `ApplicationForm.tsx` resume load, if the loaded draft has `revision_request_message`, display a prominent banner at the top of the form: "Our team asked you to update the following before resubmitting: …" with a "Mark as updated" affordance that just dismisses the banner locally.

## Technical details

- Migration uses `ALTER TYPE review_status ADD VALUE 'revisions_requested'` (must be in its own transaction; migration tool handles this).
- Edge function reuses `application_resume_tokens` table, no schema change there.
- Email template lives inline in the new edge function (mirrors `request-application-resume`).
- Audit trail comes from `revision_requested_at/by/count` + appended `reviewer_notes`.
- Token expiry for staff-requested revisions: 7 days (configurable constant in the function).

## Files to add / change

- New: `supabase/functions/request-application-revisions/index.ts`
- New migration: enum value + 4 columns on `applications`
- Edit: `src/components/management/ApplicationReviewDrawer.tsx` (new action + confirm + revisions banner + hide footer when in revisions state)
- Edit: any list view that maps `STATUS_COLORS` / filters by `review_status` (Pipeline dashboard + application list components)
- Edit: `src/pages/ApplicationForm.tsx` (banner showing `revision_request_message` when resuming)

## Out of scope

- In-line per-field comments (would require richer schema). We're using a single freeform message; sufficient for the "missing employers" use case and similar.
