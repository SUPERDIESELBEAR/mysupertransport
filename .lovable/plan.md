# Staff-edit "Propose changes" workflow

## Goal

Replace the current field-picker dialog with a real editing experience. Staff open the applicant's submitted application in the same form layout the applicant used, edit any allowed field (most importantly add/edit/remove employers and fix dates), and submit a proposal. The applicant gets an email, opens a tokenized page that shows the application with **every staff-changed field highlighted in gold** (old → new), and approves or denies.

## What changes vs today

Today: staff click "Propose changes for applicant approval" → small dialog with a dropdown field picker → for employment, paste raw JSON. Awkward.

After: staff click "Propose changes for applicant approval" → full-screen editor that mirrors the applicant's 9-step form, prefilled. Adding an employer uses the same "Add Employer" UI the applicant has. On submit, the system diffs against the original snapshot and creates one correction request containing only the changed fields.

The applicant-facing approval page and the underlying `application_correction_requests` schema already exist and stay intact — we are only changing how staff *author* the proposed changes and how the applicant *visualizes* them.

## Scope

**Editable by staff** (whitelist already exists in `_app_correction_editable_columns`):
- Personal: name, DOB, phone, email
- Address (current and previous)
- CDL: state, number, class, expiration, endorsements, 10-yr flag, referral source
- Employment: full employer array — add, edit, remove, reorder; gaps + explanation
- Driving: years experience, equipment operated
- Accidents / Violations: yes/no + descriptions
- Drug & Alcohol: SAP, positive test (2yr), return-to-duty docs
- Documents: medical cert expiration (file uploads stay out of scope — applicant only)

**Never editable by staff** (already enforced server-side): SSN, signature image, typed signature name, consent checkboxes, DL/medical file uploads.

## User flow

### Staff side
1. In `ApplicationReviewDrawer`, "Propose changes for applicant approval" opens a new full-height drawer/sheet titled "Propose changes — {Applicant Name}".
2. The drawer renders the applicant's data in the same 9-step layout (`Step1Personal` … `Step9Signature`) but in **read-only-by-default** mode with an **Edit toggle on each section**, OR — preferred — fully editable inline. Locked sections show a small "Applicant only" lock badge (SSN, signature, file uploads).
3. Staff edits values. Employment uses the existing `Step3Employment` add/remove employer UI, with month/year date inputs per project convention.
4. A sticky bottom bar shows a live "Changes (N)" pill. Clicking it opens a side panel listing every diff (old → new).
5. Staff must fill a "Reason for changes" textarea (≥5 chars), optional courtesy note, then click **Send for approval**. We compute the diff vs the loaded snapshot and call the existing `submit_application_correction` RPC with only the changed fields. Existing email goes out via `send-application-correction-email`.
6. If there are zero diffs, the Send button stays disabled.

### Applicant side
1. Email link opens the existing tokenized correction page.
2. We upgrade the viewer to render the full application form in read-only mode with **every changed field highlighted gold**, showing the original value struck through above the new value. Employment changes are shown per-employer: added rows get an "Added by SuperTransport staff" badge, edited rows show field-level diffs, removed rows show as strikethrough.
3. Footer keeps today's all-or-nothing **Approve all** / **Deny all** controls (per your earlier choice) with the existing e-signature step before approval.

## Technical notes

### New components
- `src/components/management/ProposeChangesDrawer.tsx` — full-height `Sheet` containing a stepper + editable form. Manages a local `draft: ApplicationFormData` initialized from the application row and a `snapshot` for diffing.
- `src/components/management/ProposeChangesDiffPanel.tsx` — side panel listing computed diffs with remove-from-proposal buttons.
- `src/components/application/forms/ApplicantFormEditor.tsx` — shared headless form body extracted/refactored from the existing Step components so both the applicant flow and the staff editor render the exact same fields. Locked fields accept a `readOnly` / `lockedReason` prop.
- `src/lib/applicationDiff.ts` — pure function that produces `{ field_path, field_label, old_value, new_value }[]` from `(snapshot, draft)` using `CORRECTION_FIELDS` as the whitelist. Special handling for `employers` (array diff with stable indices + add/remove markers).

### Reused / unchanged
- DB: `application_correction_requests`, `application_correction_fields`, `submit_application_correction` RPC, `get_application_correction_by_token`, response/cancel RPCs.
- Edge function: `send-application-correction-email`.
- `SuggestCorrectionsModal.tsx` is deleted; the action button in `ApplicationReviewDrawer` now opens `ProposeChangesDrawer`.

### Applicant-facing diff viewer
- Update the existing correction-response page (the route that consumes `get_application_correction_by_token`) to render the full form skeleton, then walk the `fields` payload and wrap each matching field with a `<DiffHighlight oldValue newValue />` component (gold background, strikethrough old, bold new). Employment uses a dedicated `<EmployerDiffList />` that aligns by name+start_date.

### Validation
- Reuse the existing field-level validation rules from the applicant form (zod schemas if present, otherwise the inline checks in the Step components). Staff cannot submit a draft that would fail those rules — same UX as the applicant.

### Audit & history
- The existing RPC already writes an `audit_log` entry with `field_count` and reason — keep as is. The diff list is also persisted per-field in `application_correction_fields`, so the audit timeline is preserved automatically.

## Out of scope (deferred)
- Per-field approve/deny on the applicant side (you chose all-or-nothing).
- Editing uploaded documents (DL, medical) from the staff side.
- Editing SSN / signature.
- Multiple concurrent pending proposals (RPC still blocks with `pending_request_exists`).

## Acceptance
- Staff can open Kenneth Woods' application, click "Propose changes", add a new prior employer with correct dates, fix a typo in city, and send — without ever editing JSON by hand.
- Applicant opens the email link and sees the application with the changed city highlighted gold (old → new) and the new employer row clearly labeled as added by staff.
- Approve flow still e-signs and applies changes via the existing RPCs.
