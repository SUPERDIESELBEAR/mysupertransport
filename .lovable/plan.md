## What's happening

**1. Missing unit number (confirmed in the database)**
Flint Alexander's operator record has an empty unit number, but his real unit — **178** — is stored on his onboarding record (and on his Missouri plate assignment, plate 27KT2U). The deactivation screen reads only the operator record, so it shows "Unit —" while the Driver Hub shows the unit from the onboarding record.

**2. No way to go back**
The deactivation screen has a "Back" button in the top staff header, plus a second one that is hidden on desktop widths (mobile-only). In the screenshot the top header isn't visible, so there is no visible exit at all: the wizard's own footer "Back" only steps between wizard steps and is inert on step 1.

## Fixes

**Unit number**
- When loading the driver for the deactivation screen, resolve the unit with a fallback chain: operator record → onboarding record → active Missouri plate assignment.
- Show the resolved unit in the summary header, the review step, and the safety-advisor notice email context, so the correct value (178) appears everywhere in the flow.
- Optional but recommended: when a unit is found only on the onboarding record, keep displaying it read-only rather than silently writing it back, so no data is changed during offboarding.

**Back navigation**
- Add a persistent "Back to driver" link in the wizard's own header (left of the "Deactivation & Delease" title), visible at all screen sizes, returning to the driver's detail page.
- Remove the `lg:hidden` restriction on the in-page Back button so it is always visible.
- Add a "Cancel" button next to the footer "Back" on step 1 (where step-back does nothing) that exits the wizard.
- Guard the exit with a confirm prompt only if the user has already entered a reason/date/notes, so no in-progress input is lost accidentally.

## Technical notes
- `src/pages/management/DeactivationPage.tsx` — extend the operator query to also select `onboarding_status.unit_number` and the active `mo_plate_assignments.unit_number`, and pass the first non-empty value as `unitNumber`; drop `lg:hidden` on the Back button.
- `src/components/management/DeactivationWizardContent.tsx` — add a back/cancel affordance in the sidebar header and in the step-1 footer, wired to the existing `onCancel` prop.
- `src/components/management/DeactivationWizard.tsx` (modal variant) — same header back/close treatment for consistency.
- No database or edge-function changes required; the notice email already derives the unit from the operator record and will be passed the resolved value.
