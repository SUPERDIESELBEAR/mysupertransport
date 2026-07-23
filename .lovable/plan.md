
## Problem

When a collapsible section (e.g. Inspection Binder rows, Driver Documents groups, Stage 9 Payroll and Procedures, Driver Vault categories, Onboarding stages, PEI panels, etc.) is expanded, the newly-revealed content pushes below the visible viewport. Depending on where the trigger sits, the browser sometimes even shifts the page upward, so the user loses the section entirely and has to hunt for it by scrolling.

Expected behavior: on expand, the section's header should snap to (or near) the top of the visible area so the user starts reading at the beginning of the newly-opened content and only needs to scroll downward for the rest.

## Solution — one shared hook, applied everywhere

Introduce a single reusable hook so every collapsible behaves identically. This avoids drift and lets us fix or tune the behavior in one place later.

### 1. New hook: `src/hooks/useScrollIntoViewOnOpen.ts`

- Signature: `useScrollIntoViewOnOpen(open: boolean, options?: { offset?: number; behavior?: 'smooth' | 'auto'; scrollContainer?: 'window' | RefObject<HTMLElement> }) → RefObject<HTMLElement>`
- Returns a `ref` to attach to the section's outer wrapper (or header row).
- When `open` transitions `false → true`, on the next frame (after the DOM has expanded and layout settles) it:
  1. Finds the appropriate scroll container — either `window` or the nearest scrollable ancestor (auto-detected by walking parents and checking `overflow-y`), overridable via option.
  2. Computes the element's top relative to that container.
  3. Subtracts a configurable `offset` (default 16px, or larger when a sticky header is present — most management panels have a ~64px sticky app header, so we default to 80px for management surfaces).
  4. Scrolls smoothly (`behavior: 'smooth'`, respects `prefers-reduced-motion` by falling back to `'auto'`).
- Does nothing on collapse (best UX per audit — see "Collapse behavior" below).
- Does nothing on initial mount when a section starts open (only reacts to actual user-driven toggles).

### 2. Collapse behavior

Do **not** auto-scroll on collapse. Rationale: when a user closes a section, they usually want to browse siblings that are now visible above/below; snapping the (now-empty) header to the top would feel jarring and hide the surrounding context. This matches the "recommended" option from the question.

Multiple open sections: per your answer, we always scroll the just-opened section's header to the top, regardless of what else is open.

### 3. Files to update (full audit)

Attach the hook's ref to the outermost wrapper of each collapsible section. No visual changes — behavior only.

**Management dashboard — Driver Hub and related**
- `src/components/drivers/DriverVaultCard.tsx` — top-level card and per-category sub-groups
- `src/components/drivers/DriverHubView.tsx` — driver sections
- `src/components/drivers/DriverRoster.tsx` — expandable driver rows
- `src/components/management/CorrectionRequestStatusCard.tsx`
- `src/components/management/RevisionAuditLog.tsx`
- `src/components/management/ActivityLog.tsx`
- `src/components/management/NotificationHistory.tsx`
- `src/components/management/FaqManager.tsx`
- `src/components/management/PipelineConfigEditor.tsx`
- `src/components/management/ProposeChangesDrawer.tsx`
- `src/components/management/StaffApplicationModal.tsx`
- `src/components/management/SubmittedApplicationSnapshot.tsx`
- `src/components/management/TruckOwnerCard.tsx`
- `src/components/management/FormsCatalog.tsx`
- `src/components/management/ResourceLibraryManager.tsx`

**Onboarding pipeline (all stages, including Stage 9 Payroll and Procedures)**
- `src/components/management/OperatorDetailPanel.tsx` — every stage accordion
- `src/components/operator/ContractorPaySetup.tsx` (Stage 9 sub-sections)
- `src/components/operator/OnboardingChecklist.tsx`
- `src/components/operator/PEScreeningTimeline.tsx`

**Inspection Binder / Compliance**
- `src/components/inspection/OperatorInspectionBinder.tsx` — the primary case the user called out
- `src/components/inspection/BinderFlipbook.tsx`
- `src/components/inspection/InspectionComplianceSummary.tsx`
- `src/components/inspection/ComplianceAlertsPanel.tsx`
- `src/components/inspection/DocRow.tsx`

**Vehicle Hub / Equipment / Fleet**
- `src/components/fleet/FleetDetailDrawer.tsx`
- `src/components/fleet/FleetRoster.tsx`
- `src/components/equipment/EquipmentAssetSheet.tsx`
- `src/components/equipment/EquipmentInventory.tsx`

**PEI / Applications**
- `src/components/pei/PEIQueuePanel.tsx`
- `src/components/pei/ApplicationPEITab.tsx`

**Driver-facing (SUPERDRIVE)** — same behavior for consistency
- `src/components/operator/TruckInfoCard.tsx`
- `src/components/operator/OperatorStatusPage.tsx`
- `src/components/operator/OperatorResourcesAndFAQ.tsx`
- `src/components/operator/DeletedDocumentsTray.tsx`
- `src/components/operator/SettlementForecast/PastSettlements.tsx`
- `src/components/documents/DocumentHub.tsx` (category expanders on driver side)
- `src/pages/dispatch/DispatchPortal.tsx` (any collapsible cards)

For each file: import the hook, call it with the section's `open` state, and attach the returned ref to that section's outer container. No prop or API changes on any component.

### 4. Edge cases handled

- **Sticky headers**: default offset of 80px keeps the section header visible below the app's sticky top bar. Where a panel has its own additional sticky sub-header (e.g. Inspection Binder's driver picker), we pass a larger offset (~128px).
- **Drawers / modals with internal scroll** (e.g. `ApplicationReviewDrawer`, `FleetDetailDrawer`): the hook auto-detects the nearest scrollable ancestor, so scrolling stays inside the drawer and doesn't jump the page underneath.
- **Reduced motion**: uses `auto` instead of `smooth` when the user has `prefers-reduced-motion: reduce`.
- **Timing**: uses `requestAnimationFrame` (double-RAF where content includes async loads / images) so the scroll happens after the expanded content has actually taken its height.
- **Initial open state**: sections that render already-open on first mount do NOT auto-scroll; only real user toggles trigger the scroll.

### 5. Verification

- Manually test the three called-out cases: Inspection Binder rows, Driver Documents category groups in Driver Hub, and Stage 9 in Onboarding.
- Spot-check three more surfaces from different areas (Fleet Detail Drawer inside its own scroll container, PEI Queue Panel, and driver-facing Truck Info Card) to confirm both window-scroll and container-scroll paths work.
- Confirm collapsing a section does not move the page.

## Out of scope

- No changes to what sections default to open vs. collapsed (that was already addressed in prior work).
- No visual redesign of any collapsible — this is a pure behavior change.
- No changes to non-collapsible navigation (tabs, route changes) — those already scroll to top on their own where appropriate.
