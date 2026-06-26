# Preserve & Display Submitted Application in Driver Hub → Onboarding History

## Problem

The data link is actually intact at the database level — `operators.application_id` ties each driver to their original `applications` row throughout the lifecycle (Application → Pipeline → Driver Hub). The breakdown is purely in the **Driver Hub UI**: `OperatorDetailPanel` only pulls a small subset of the application row (name, email, phone, address, CDL/medical expirations, license photos). All the rich content the applicant entered — CDL details, endorsements, employment history, gaps, driving experience, equipment, accidents, violations, drug & alcohol status, disclosures, signature/signed date — is never loaded or rendered, so it looks "lost."

This plan surfaces that data, read-only, inside the existing **Onboarding History** section.

## Changes

### 1. Load the full application row
**File:** `src/pages/staff/OperatorDetailPanel.tsx` (around line 1039)

Expand the `applications (...)` select on the operator query to pull every column needed for the snapshot (keep listing them explicitly rather than `*` to preserve type narrowing):

- Personal: existing fields + `address_line2`, `address_duration`, `prev_address_*`
- CDL: `cdl_state`, `cdl_number`, `cdl_class`, `endorsements`, `cdl_10_years`, `referral_source`
- Employment: `employers` (jsonb), `employment_gaps`, `employment_gaps_explanation`
- Driving: `years_experience`, `equipment_operated`
- Incidents: `dot_accidents`, `dot_accidents_description`, `moving_violations`, `moving_violations_description`
- Drug/Alcohol: `sap_process`, `dot_positive_test_past_2yr`, `dot_return_to_duty_docs`
- Disclosures: `auth_safety_history`, `auth_drug_alcohol`, `auth_previous_employers`, `testing_policy_accepted`
- Signature: `typed_full_name`, `signature_image_url`, `signed_date`, `submitted_at`, `submitted_by_staff`

No schema/migration changes — the columns already exist on `applications`.

### 2. New read-only snapshot component
**New file:** `src/components/management/SubmittedApplicationSnapshot.tsx`

- Props: `application: ApplicationRow | null`
- Card layout grouped by the 9 application steps (Personal, CDL, Employment, Experience, Accidents, Drug & Alcohol, Documents, Disclosures, Signature).
- Uses existing tokens (gold, surface, border) — no hardcoded colors.
- Employment history rendered as a stacked list of employer cards (name, dates MM/YYYY, city/state, position, CMV y/n, reason for leaving, contact email).
- Document fields (`dl_front_url`, `dl_rear_url`, `medical_cert_url`) render as "View" buttons that open the existing `FilePreviewModal` via a passed-in `onPreview(url, name)` callback.
- Signature shows typed name + `signed_date` + `submitted_at` timestamp + a "Submitted by staff" badge when applicable.
- Empty/null fields rendered as muted "—" so missing data is obvious without throwing.
- Print-friendly: a small "Print application" button reuses the existing popup-window pattern (`buildPrintHtml` style from `PEIResponseViewer`).

### 3. Render inside Onboarding History
**File:** `src/pages/staff/OperatorDetailPanel.tsx` (around line 6390)

Add a new collapsible block, ordered with the other history items (`order: 19`, just above the existing stage blocks at 20–24), that only renders when `isQuickView && onboardingHistoryExpanded`. It contains the `SubmittedApplicationSnapshot` and passes `applicationData` plus an `onPreview` handler that reuses the existing `setStage2Preview` modal flow.

The toggle's caption updates from `(Stages 1–7, Costs, Progress)` to `(Application, Stages 1–7, Costs, Progress)`.

### 4. Empty-state handling
If `applicationData.id` is null (pre-existing operator added directly, no application on file), show a small muted note: *"No original application on file — this driver was added directly."* No errors.

## Out of scope

- Editing the submitted application from this view (existing edit affordances in the Overview tab remain the way to amend data).
- Schema changes or any backend/RLS work — RLS on `applications` already allows staff to read these rows.
- Pipeline or Application page UI changes — the data already shows there.
- Adding the snapshot to the operator-facing portal.

## Verification

1. Open Driver Hub → pick a driver who originally submitted an application → expand **Onboarding History** → confirm the new **Submitted Application** card lists every field the driver entered, with documents previewable.
2. Open a pre-existing operator (no `application_id`) → confirm the muted empty-state note shows instead of an error.
3. Confirm the Pipeline drawer and Application page are unchanged.
