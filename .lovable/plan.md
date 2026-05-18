## Goal

When staff click **"Move to pending & suggest corrections"**, the application should move into a state where staff can edit and submit corrections, **without erasing the original revision-request notes or the May 15, 2026 timestamp**. Staff should also be able to upload a screenshot (or other file) of the email reply the applicant sent with the revised info, so it's attached to the revision history.

Apply this to Kenneth Woods (`797fb914-…f18e9`, revisions_requested on 2026-05-15) so his case is unstuck.

---

## What changes

### 1. Preserve revision history on move-to-pending

Today the `move_revisions_to_pending` Postgres function nulls out `revision_requested_at`, `revision_request_message`, `revision_requested_by`, and `pre_revision_status`. Those are exactly the fields the user wants to keep.

Update the function to:
- Flip `review_status` from `revisions_requested` → `pending`.
- **Keep** `revision_requested_at`, `revision_request_message`, `revision_requested_by`, `pre_revision_status` (so the May 15 history stays visible).
- Set two new columns on `applications`:
  - `revisions_handled_by_staff_at TIMESTAMPTZ`
  - `revisions_handled_by_staff_id UUID`
- Still invalidate any open `application_resume_tokens` (applicant link is dead).
- Still write the existing audit-log entry.

### 2. Revision-reply attachments (email screenshots)

New table `public.application_revision_attachments`:
- `application_id` (FK), `file_path` (storage path), `file_name`, `mime_type`, `size_bytes`, `note` (optional caption), `uploaded_by`, `uploaded_at`.
- RLS: staff (owner / management / dispatcher / onboarding_staff) can select / insert / delete; the applicant cannot see them.

New private storage bucket `application-revision-replies` with staff-only RLS (same role check). Files stored at `<application_id>/<uuid>-<filename>`. Images and PDFs allowed.

### 3. UI — Application Review drawer

Rework the "Revisions requested" block in `ApplicationReviewDrawer.tsx` so it shows whenever `revision_requested_at` is set (not only when status is still `revisions_requested`):

- **Before move-to-pending** (status = `revisions_requested`): unchanged — same banner, same "Move to pending & suggest corrections" / "Undo — sent in error" buttons.
- **After move-to-pending** (status = `pending` but `revisions_handled_by_staff_at` set): same colored block, header reads "Original revision request — sent May 15, 2026 · now handled by staff", keeps the original message, hides the move/undo buttons.

Inside that block, a new **Applicant's reply** sub-section:
- "Upload screenshot or file" button (accepts `image/*,application/pdf`, max 10 MB).
- List of uploaded attachments with thumbnail (for images), filename, who uploaded, when, and a delete (✕) button. Click to open in `FilePreviewModal`.
- Optional one-line caption per upload.

The existing `SuggestCorrectionsModal` already auto-opens after the move; no change needed there.

### 4. Kenneth Woods

No data backfill — his row already has `revision_requested_at` and `revision_request_message` populated. Once the new function is deployed, staff opens his application, clicks **"Move to pending & suggest corrections"**, uploads the screenshot of his email reply, and submits corrections through the existing `SuggestCorrectionsModal` flow.

---

## Technical details

**Migration**
- `ALTER TABLE applications ADD COLUMN revisions_handled_by_staff_at TIMESTAMPTZ, ADD COLUMN revisions_handled_by_staff_id UUID;`
- `CREATE TABLE application_revision_attachments (...)` + RLS policies using `has_role` for owner/management/dispatcher/onboarding_staff.
- `INSERT INTO storage.buckets (id, name, public) VALUES ('application-revision-replies','application-revision-replies', false);` + RLS on `storage.objects` restricted to the same staff roles.
- `CREATE OR REPLACE FUNCTION move_revisions_to_pending(...)` — preserve fields, set new staff columns, same audit log.

**Frontend**
- `src/components/management/ApplicationReviewDrawer.tsx`
  - Change render guard from `app.review_status === 'revisions_requested'` to `!!app.revision_requested_at`.
  - Conditionally show original buttons only when `app.review_status === 'revisions_requested'`.
  - Mount a new `RevisionReplyAttachments` component inside the block.
  - Extend `FullApplication` with the two new columns.
- New `src/components/management/RevisionReplyAttachments.tsx`:
  - Loads rows from `application_revision_attachments`.
  - Upload via `supabase.storage.from('application-revision-replies').upload(...)` then insert row.
  - Uses `FilePreviewModal` for viewing; signed URLs (1 h) for thumbnails.
  - Delete removes storage object and row.

**Notification email** — unchanged. The existing `notify-application-moved-to-pending` keeps firing.

---

## Out of scope
- No changes to `SuggestCorrectionsModal`, audit-log UI, or the applicant-facing email link (still invalidated).
- No PII redaction on uploaded screenshots — staff responsibility.
