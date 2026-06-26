## Plan

1. **Fix the database source of truth for ICA completion**
   - Add a backend migration trigger so when an ICA contract is marked `fully_executed` or receives `contractor_signed_at`, the matching `onboarding_status.ica_status` is automatically set to `complete`.
   - This addresses the root cause shown by the test data: Emma’s `ica_contracts.status` is `fully_executed`, but `onboarding_status.ica_status` is still `sent_for_signature`.
   - Include a one-time backfill to repair existing mismatched rows like Emma’s.

2. **Stop relying only on `onboarding_status.ica_status` in the driver portal**
   - Have `OperatorPortal.tsx` fetch the latest ICA contract status/signature timestamp alongside onboarding status.
   - Pass both sources into the existing `isIcaComplete` / `isIcaActionRequired` helpers.
   - Update Stage 3 status, ICA substep value, top banner, sticky bottom CTA, ICA nav dot, and next-step logic to use the combined source of truth.

3. **Make ICA updates real-time in the portal**
   - Add an `ica_contracts` real-time subscription filtered by `operator_id`, in addition to the existing `onboarding_status` subscription.
   - When contract signing updates arrive, update local ICA contract state and refetch portal data so all ICA buttons/banners change immediately without a refresh.

4. **Fix onboarding progress calculation consistency**
   - Derive `completedStages` and `progressPct` directly from the same `stages` array that renders the stage cards.
   - Add a defensive fallback inside `OperatorStatusPage` / `OnboardingChecklist` so if parent progress props are stale or zero while rendered stages are complete, the displayed count/percentage recalculates locally from visible stage statuses.
   - Expected Emma result after Stage 1 and Stage 2 complete: `2 of 8 done`, `25%`.

5. **Validate with the current test data**
   - Re-query the database to confirm Emma’s mismatched ICA row is repaired by the migration/backfill.
   - Use the driver portal preview with an authenticated session if available; otherwise verify via source-level/data-level checks and explain any limitation.
   - Confirm the UI no longer shows red/gold ICA signing actions once the contract is fully executed and the progress tracker reflects completed stages.