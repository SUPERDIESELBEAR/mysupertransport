# Staff Corrections With Applicant Approval

Adds a flow where staff fix typos / clerical issues on a submitted application directly inside the review drawer, then send the applicant a tokenized link to review the diff and e-sign their approval. Complements (does not replace) the existing "Revert for Revision" flow.

## User flow

**Staff side** (Application Review Drawer)
1. New "Edit application" toggle on the drawer header → switches each section into editable inputs (everything except SSN and the original signature image).
2. Staff change one or more fields. A right-rail "Pending changes" panel lists each edit as `Field: old → new`.
3. Staff click **Send for applicant approval** → modal asks for a required *Reason for changes* note (shown to the applicant) and an optional courtesy email message.
4. A `application_correction_request` row is created (status `pending`), every field-level diff is stored, and a tokenized email goes to the applicant.
5. Drawer shows a yellow "Awaiting applicant approval — sent {ts} by {staff}" banner. Further staff edits are blocked until the applicant responds (staff may *Cancel request* at any time).

**Applicant side** (new public page `/application/approve/:token`)
1. Loads via SECURITY DEFINER RPC keyed off the token (no auth, like PEI/FCRA).
2. Shows: who made the changes, the reason, and a clean before/after diff per field.
3. Two buttons: **Approve & sign** or **Reject changes**.
4. Approve → typed-name + signature pad → submits with IP/UA captured server-side. The diff is applied to `applications` in a single transaction; correction request marked `approved`; staff notified.
5. Reject → optional reason text → request marked `rejected`; **edits stay pending** so staff can adjust and resend (per your answer #4). Staff get an in-app + email notification.

## Audit trail

- `application_correction_requests` — one row per send, with `application_id`, `requested_by_staff_id`, `reason_for_changes`, `status` (`pending`/`approved`/`rejected`/`cancelled`/`expired`), `token`, `sent_at`, `responded_at`, `signed_ip`, `signed_user_agent`, `signed_typed_name`, `signature_image_url`, `rejection_reason`.
- `application_correction_fields` — one row per changed field, with `request_id`, `field_path` (e.g. `address_city`, `employers[1].end_date`), `old_value` (jsonb), `new_value` (jsonb).
- Every state change writes to the existing `audit_log` via `search_audit_log` so it shows up in the Audit Log view alongside reverts.

## Locked fields

Editable: all personal/contact, addresses, CDL fields, endorsements, employer entries (incl. add/remove rows), employment gaps, driving experience, equipment, accidents/violations, DOT drug/alcohol answers, document URLs.

Locked (greyed out with a lock icon + tooltip "Applicant must change this themselves — use Revert for Revision"): `ssn`, `signature_image_url`, `typed_full_name`, `signed_date`, `auth_*` consent checkboxes, `testing_policy_accepted`. For these the existing **Revert for Revision** flow is the right tool.

## Database

New migration:
- `application_correction_requests` table + RLS (staff read/write via `is_staff()`, public read of single row by token via SECURITY DEFINER RPC).
- `application_correction_fields` table + RLS (staff read; inserts only via the staff-side RPC; readable by token via the same RPC).
- `submit_application_correction(p_application_id, p_reason, p_fields jsonb[])` — creates request + field rows atomically, returns token.
- `get_application_correction_by_token(p_token)` — returns request + fields + applicant first/last name (no SSN).
- `approve_application_correction(p_token, p_signed_name, p_signature_url, p_meta jsonb)` — applies all diffs to `applications`, stamps approval + ip/ua, fires notification trigger.
- `reject_application_correction(p_token, p_reason)` — marks rejected.
- `cancel_application_correction(p_request_id)` — staff-only, marks cancelled.
- Trigger on status change → notifies the assigned onboarding staff (in-app + email via existing pattern).

Token: 32-byte URL-safe, stored hashed; 14-day expiry.

## Edge functions

- `send-application-correction-email` — renders email with reason + summarized diff + approve link, enqueues via existing email queue. CC'd to assigned onboarding staff so they have a copy.
- `notify-application-correction-response` — fired by trigger, emails the staff member when applicant approves or rejects (uses existing `enqueue_email`).
- `log-application-correction-event` — captures IP/UA on link open + on submit (mirrors `log-pei-event`).

No CC of staff on the *applicant-facing* email beyond the assigned coordinator (matches your past PEI preference of avoiding inbox noise).

## Frontend changes

- `ApplicationReviewDrawer.tsx` — add edit mode state, per-field editable controls, pending-changes side panel, status banner. Reuse existing `FormField`, `DateInput`, `Select` patterns from the application form.
- New `SendCorrectionRequestModal.tsx` — reason textarea, courtesy message, send button, summary of pending diff.
- New `CorrectionRequestStatusCard.tsx` — shown inside drawer when a request is pending/approved/rejected, with "Cancel request" + "Resend" actions.
- New page `src/pages/ApplicationApprove.tsx` — public diff viewer + signature pad (reuses `react-signature-canvas` setup from ICA). Route added in `App.tsx`.
- `src/lib/applicationCorrections/` — `api.ts`, `types.ts`, `diffUtils.ts` (path → label mapping for human-readable diff).
- Audit Log: add `application_correction_sent` / `_approved` / `_rejected` / `_cancelled` action types to the existing `search_audit_log` filter list.

## Out of scope

- Editing locked fields (SSN, signature, consents) — these still require the existing Revert for Revision flow.
- Mobile applicant-side polish beyond what `/application/approve` needs to render cleanly (will follow existing `PEIRespond` mobile patterns).
- Versioned history of multiple approved correction rounds beyond what the audit log captures (each round is its own request row, which is sufficient).

## Verification

1. As staff, edit two fields on a submitted application, send for approval → confirm request + 2 field rows + email enqueued.
2. Open the tokenized link in an incognito window → diff renders, IP/UA event logged.
3. Approve and sign → `applications` row reflects new values, request marked `approved`, signed_ip/ua stored, staff notified, audit log entries present.
4. Repeat with reject → application unchanged, edits remain pending in the request, staff notified, drawer shows "Rejected — adjust and resend".
5. Cancel a pending request from the drawer → status flips to `cancelled`, email link returns "no longer active".
