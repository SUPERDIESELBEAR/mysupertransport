

## Staff-Assisted Application Feature

### Summary

Add a "New Application" button in the Management Portal's Applications section that opens the full 9-step application form in a modal/drawer. Staff fills out the form on behalf of an applicant, and on submit it creates a completed application record in the pipeline — identical to one submitted by the applicant themselves.

### Approach

Rather than duplicating the entire 680-line `ApplicationForm.tsx`, create a new modal component that **reuses the existing step components** (Step1Personal through Step9Signature) and the existing `buildPayload` logic, but runs within the management context (authenticated user, no draft token logic).

### Changes

**1. Extract `buildPayload` and `validateStep` into shared utilities**

Move the `buildPayload` function and `validateStep` function from `src/pages/ApplicationForm.tsx` into `src/components/application/utils.ts` so both the public form and the staff-assisted modal can import them. Update `ApplicationForm.tsx` to import from the new location.

**2. New component: `src/components/management/StaffApplicationModal.tsx`**

A full-screen dialog (Sheet) containing:
- The same 9 step components (Step1–Step9) with FormProgress
- Same validation logic per step
- On submit: builds the payload using `buildPayload`, inserts into `applications` with `is_draft: false` and `submitted_at`, encrypts SSN via the existing `encrypt-ssn` edge function (using the staff member's auth token)
- Marks the application with a metadata field `submitted_by_staff: true` so it is distinguishable
- Fires the `new_application` notification
- Document uploads in Step 7 use the existing anonymous upload pattern (application-documents bucket)
- Signature in Step 9 uses the existing signature canvas and uploads to the signatures bucket
- Skips draft token / localStorage logic entirely
- Skips the duplicate email check (staff may intentionally re-enter)
- Logs the action to `audit_log`

**3. `src/pages/management/ManagementPortal.tsx`**

- Import `StaffApplicationModal`
- Add state: `staffAppModalOpen`
- Add a "New Application" button next to the existing "Invite Someone" button in the Applications header
- Wire the modal open/close and refresh applications list on successful submit

**4. Database: Add `submitted_by_staff` column to `applications`**

A nullable boolean column defaulting to `false`, so staff-submitted applications can be identified in the review drawer.

### No Other File Changes

The existing step components (Step1–Step9) already accept `data`, `onChange`, and `errors` props — they work without modification. The `ApplicationReviewDrawer` already renders all application fields and will display staff-submitted applications identically.

### Security

- Staff authentication is verified via the existing session token
- SSN encryption uses the same `encrypt-ssn` edge function
- Document uploads use the existing `application-documents` bucket (which has anon insert policies already for the public form)
- Audit log entry records who submitted the application

### Files Changed

| File | Change |
|------|--------|
| `src/components/application/utils.ts` | New — extracted `buildPayload` and `validateStep` |
| `src/pages/ApplicationForm.tsx` | Import `buildPayload`/`validateStep` from utils instead of inline |
| `src/components/management/StaffApplicationModal.tsx` | New — full 9-step form in a Sheet dialog |
| `src/pages/management/ManagementPortal.tsx` | Add "New Application" button + modal state |
| Database migration | Add `submitted_by_staff` boolean column to `applications` |

