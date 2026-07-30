Make the device-local nature of divergence resolution explicit to users and future maintainers.

## 1. Driver confirmation on dismiss

In `src/components/operator/rods/RodsView.tsx`, replace the current direct-call `onDismissDivergence` handler with an explicit confirmation step before calling `acknowledgeDivergence`.

Implementation:
- Add a local state `pendingDismissDate: string | null`.
- Render an `<AlertDialog>` (from `src/components/ui/alert-dialog.tsx`) when `pendingDismissDate` is set.
- Dialog title: "Clear this warning?"
- Dialog description: "This only clears the warning on this device. Other devices will still show it, and this does not resolve the mismatch — the office copy of this log still differs from the one on this phone."
- Primary action: "Clear on this device" — calls the existing `acknowledgeDivergence` flow and closes the dialog.
- Cancel action: "Cancel" — closes the dialog without acknowledging.

This applies to the driver path only. There is no Management console resolution UI yet (Stage 4).

## 2. Clarify the button copy in the warning chip

In `src/components/operator/rods/RodsDayStrip.tsx`, change the dismiss button text from "Management contacted me — dismiss" to "Clear on this device", so the scope is visible and the label makes no claim the app cannot verify.

## 3. Add a code comment at the acknowledgement site

In `src/lib/eld/offline/divergence.ts`, add a comment immediately above `acknowledgeDivergence` explaining that this is the device-local interim resolution path and that the server-side table and sync kind will be supplied in Stage 4.

Proposed comment:
```
/**
 * Resolve a divergence locally. This is intentionally device-local until Stage 4
 * introduces a server-side divergence resolution table and a sync-queue kind for
 * acknowledgement propagation. Do not treat this as the final, cross-device flow.
 */
```

## Files touched
- `src/components/operator/rods/RodsView.tsx`
- `src/components/operator/rods/RodsDayStrip.tsx`
- `src/lib/eld/offline/divergence.ts`

## Verification
- Run offline divergence tests (`bunx vitest run src/lib/eld/offline/__tests__/divergence.test.ts`).
- Build/typecheck the project.
- Optionally drive the driver app to the RODS view and confirm the warning chip shows the new button text and the confirmation dialog appears with the "this device only" wording.