## Problem

The prior fix (storage path + column whitelist) was applied, but tapping **Execute** still shows "Something went wrong while saving your signature." No signature-related network requests or console logs were captured in the current snapshot, so we can't yet see which step is failing (`storage.upload`, `createSignedUrl`, the `onboarding_status` update, or an after-update trigger raising).

The catch block in `EquipmentAssetSheet.tsx` (`handleExecute`, line ~196) swallows the actual `err.message` and shows a generic toast. That is preventing diagnosis.

## Fix

### 1. Surface the real error (frontend only)
`src/components/equipment/EquipmentAssetSheet.tsx`, `handleExecute` catch block:

- Keep the `console.error('[EquipmentAssetSheet] signature save failed', err)` line.
- Also log the step that failed by wrapping each awaited call and setting a local `step` string (`'upload' | 'signed_url' | 'update'`) before each await; include it in the console error.
- Change the toast to include the underlying reason:
  `toast.error(err?.message ? \`Couldn't save signature: ${err.message}\` : "Something went wrong while saving your signature. Please try again.")`

No behavior change on success. This gets the real Postgres/Storage error message onto the screen and into the console on the next tap so we can pinpoint the failing step.

### 2. Next turn
Once the user taps Execute again, the console log + toast will reveal the actual error (RLS message, trigger raise, HTTP 4xx, etc.), and we'll ship the targeted fix in a follow-up.

## Out of scope

- No DB migrations in this turn (previous whitelist migration stays).
- No changes to management/staff flow, receipts uploads, or storage bucket policies.
