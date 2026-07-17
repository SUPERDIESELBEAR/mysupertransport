# Email Tracey McQuilken — Stage 8 (Go Live & Dispatch Readiness)

Add a one-click email action inside Stage 8 that lets staff send driver/truck details plus any ad-hoc attachments to DOT Consultant **Tracey L. McQuilken** at `tracey@iondot.net`, mirroring the "Send to Insurance Company" pattern used in Stage 7.

## What staff will see

Inside the Stage 8 card, below the Go-Live section, a new panel:

- Header: **Email Tracey McQuilken** (DOT Consultant)
- Read-only recipient chip: `tracey@iondot.net` (single fixed recipient — no add/remove UI)
- **Attachments** area:
  - Drag-and-drop / "Add files" picker (multi-select). Accepts PDF, JPG/PNG, DOC/DOCX, XLS/XLSX.
  - Per-file limit **10 MB**, combined limit **20 MB** (Resend cap), max 10 files. Over-limit files show an inline error and are not queued.
  - Each queued file shows filename, size, and a remove (×) button.
  - Files are uploaded to a new private storage bucket `dot-consultant-attachments` at path `{operator_id}/{timestamp}-{filename}` when staff clicks Send (or eagerly with a progress indicator, whichever the code cleanly supports — we'll upload on Send to keep the flow simple and let staff cancel by removing before sending).
- **Notes to Tracey** textarea (optional — e.g. specific question, ETA, follow-up context)
- Gold outlined button: **Send to Tracey McQuilken** (with `Mail` icon; turns green "Sent!" for 5s on success, matching Stage 7 behavior)

Because the recipient is fixed and global, we skip the recipient-management UI that Stage 7 needs.

## What the email will contain

Same building blocks as the insurance email so Tracey has everything a DOT consultant typically needs:

- Driver name, email, CMV years of experience
- DL copy (attached if <4MB, otherwise 7-day signed link — same helper Stage 7 uses)
- Truck VIN / Year / Make (from `onboarding_status`, falling back to `ica_contracts`)
- Unit number, Go-Live Date, Operator Type (Solo/Team)
- Optional staff notes from the new textarea
- **Any files staff added in the Attachments area** — sent as real Resend attachments when total payload is within the 20 MB cap; anything above the cap is instead linked as 7-day signed URLs at the bottom of the email (same fallback pattern as the DL)
- Reply-to `onboarding@mysupertransport.com`

Subject: `DOT Consultant Request — {Driver Name}`

## Technical details

1. **New private storage bucket** `dot-consultant-attachments`
   - Created via `supabase--storage_create_bucket` (public=false)
   - RLS on `storage.objects`: staff roles (`onboarding_staff | dispatcher | management | owner`) can INSERT / SELECT / DELETE their operator's folder; service_role full access for the edge function
   - Uploaded via existing `uploadToBucket` helper (`src/lib/uploadWithAuth.ts`) with `requireSession: true`

2. **New edge function** `supabase/functions/send-dot-consultant-request/index.ts`
   - Cloned from `send-insurance-request/index.ts` with these differences:
     - Recipient hardcoded to `tracey@iondot.net`
     - Accepts request body `{ operator_id, notes?, attachment_paths?: string[] }`
     - For each `attachment_paths` entry: download from `dot-consultant-attachments`, base64-encode, add to Resend `attachments`; if running total exceeds ~20 MB, switch remaining attachments to 7-day signed URLs rendered as links in the email body
     - Pulls `unit_number`, `go_live_date`, `operator_type` from `onboarding_status`
     - Auth: JWT + `user_roles` check for `onboarding_staff | dispatcher | management | owner`
     - Audit log `action: 'dot_consultant_request_sent'` with recipient, attachment count, and notes
   - Deployed with default JWT verification

3. **`src/pages/staff/OperatorDetailPanel.tsx`**
   - Add state: `sendingDotEmail`, `dotEmailSent`, `dotEmailNotes`, `dotAttachments` (array of `{ file: File, error?: string }`)
   - Add `handleSendDotConsultantEmail`:
     1. Upload each queued file via `uploadToBucket('dot-consultant-attachments', ...)`
     2. Invoke edge function with resulting paths, `notes`, and `operator_id`
     3. Toast success/failure; clear queue on success
   - Render the new panel inside the Stage 8 `!s7Collapsed` block, right after the Go-Live confirmation area

4. No new tables, no new secrets.

## Out of scope

- Persisting/reusing sent attachments across sessions (once sent, staff can re-upload if needed later)
- Configurable recipients / CC list (recipient is fixed per request)
- Server-side virus scanning of uploads
