## Change

Make the "Submitted Application" section on the Onboarding Pipeline → operator detail page collapsible, matching the chevron-toggle pattern used by "Onboarding History" and the other stage cards. It will render collapsed by default so staff can expand it only when needed.

## Implementation

Edit `src/components/management/SubmittedApplicationSnapshot.tsx`:

1. Add local `expanded` state (default `false`) plus `ChevronDown` icon import.
2. Convert the existing header row (`FileText` + "Submitted Application" + Staff-assisted badge + Print button) into a clickable toggle button on the title area, with the chevron rotating on expand. Keep the Print button outside the toggle so clicking it still works when the section is collapsed.
3. Wrap the body (all `<Section>` blocks starting at Personal through Signature) in `{expanded && (...)}`.
4. Preserve the empty-state branch (`!application || !application.id`) unchanged — it stays as a simple non-collapsible notice.

No changes required in `OperatorDetailPanel.tsx` — the collapse lives inside the snapshot component so the existing `onboardingHistoryExpanded` gate above it continues to work as-is.

## Files touched

- `src/components/management/SubmittedApplicationSnapshot.tsx`