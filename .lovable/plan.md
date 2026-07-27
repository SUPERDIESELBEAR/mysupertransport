# Plan: Convert Deactivation Wizard to a Full-Page Route

## Summary
Move the existing Deactivation & Delease Wizard from a centered modal (`max-w-2xl`) into a dedicated full-page route so the full content fits within the browser window without needing a vertical scrollbar.

## Current state
- The wizard is rendered inside a `<Dialog>` with `max-w-2xl max-h-[90dvh] overflow-y-auto` in `src/components/management/DeactivationWizard.tsx`.
- It is opened from two launch points:
  - `src/pages/staff/OperatorDetailPanel.tsx` (lines 2483, 2689, and 4172–4191)
  - `src/components/fleet/FleetRoster.tsx` (lines 572 and 697)
- The surrounding portal uses `StaffLayout` with a collapsible sidebar, leaving a wide content area on desktop that is currently unused by the wizard.

## Proposed changes

### 1. Add a dedicated route
In `src/App.tsx`, add a protected route for `/management/deactivate/:operatorId` **before** the existing `/management/*` wildcard. It will use the same role guard as `/management/*` (management only).

### 2. Create a new full-page page
Create `src/pages/management/DeactivationPage.tsx` that:
- Reads `operatorId` from the URL via `useParams`.
- Renders inside `StaffLayout` so the user retains the staff navigation and sidebar context.
- Uses the full content area (no `max-w-2xl` constraint).
- Uses a two-column desktop layout: a sticky left rail showing the 9 step labels, and a right area showing the active step content.
- Provides a top header with driver name, unit number, back-to-driver button, and cancel action.
- Defaults back to `/dashboard?view=drivers` on completion or cancellation.

### 3. Extract reusable wizard content
Refactor `src/components/management/DeactivationWizard.tsx` so that:
- All state, handlers, data fetching, and per-step rendering are moved into a reusable component (tentatively `DeactivationWizardContent`).
- The existing `DeactivationWizard` modal becomes a thin wrapper around that content, preserving the current modal behavior for any future use.
- `DeactivationPage.tsx` consumes the same content component, only changing the surrounding layout.

### 4. Update launch points
- In `src/pages/staff/OperatorDetailPanel.tsx`, replace the three modal-related calls (`setShowDeactivationWizard(true)` and the `<DeactivationWizard>` JSX) with a `navigate('/management/deactivate/${operatorId}')` call.
- In `src/components/fleet/FleetRoster.tsx`, replace the two `setDeactivationTarget(row)` calls with navigation to the same route.
- Remove the modal state and imports from both files if they become unused.

### 5. Completion & navigation behavior
- On successful deactivation, the wizard will navigate back to the originating context (driver detail or vehicle hub). Where possible, pass the return location via `location.state` or `sessionStorage` so the user lands back where they started.
- If no return context is available, default to `/dashboard?view=drivers`.

### 6. Responsive design
- Desktop: two-column layout with the stepper as a left rail and the active step content on the right.
- Tablet/mobile: single-column stacked layout with a compact horizontal or collapsible stepper so the workflow remains usable on small screens.

## Files that will change
- `src/App.tsx` — add `/management/deactivate/:operatorId` route.
- `src/components/management/DeactivationWizard.tsx` — extract reusable content component.
- `src/pages/management/DeactivationPage.tsx` — new full-page wrapper.
- `src/pages/staff/OperatorDetailPanel.tsx` — replace modal open with navigation.
- `src/components/fleet/FleetRoster.tsx` — replace modal open with navigation.

## Verification
- Build/typecheck the project after changes.
- Confirm navigation from the driver detail page and the vehicle hub opens the new full-page route.
- Confirm each wizard step renders without vertical scrolling on a 1080p desktop viewport.
- Confirm completion redirects back to the originating page.