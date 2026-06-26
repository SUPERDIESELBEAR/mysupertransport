## Goal
Make the driver portal reflect a signed ICA immediately and consistently, and swap action-required CTAs/banners for completed-state equivalents.

## Root cause (Part 1)
The portal uses `onboarding_status.ica_status` everywhere to decide "needs signing." Two driver signing paths exist, but only one flips that flag:

1. **Owner-operator self-sign** (`OperatorICASign.tsx`) — already updates `onboarding_status.ica_status = 'complete'`. Works.
2. **Non-owner driver acknowledging an owner-signed ICA** (`DriverICAAcknowledgment.tsx`) — only inserts a row into `ica_driver_acknowledgments`, never updates `ica_status`. So all UI keeps reading `sent_for_signature` forever.

Realtime is already wired on `onboarding_status` in `OperatorPortal.tsx`, so once the flag flips correctly, every consumer rerenders without a refresh. Nothing about subscriptions needs to change.

## Fix plan

### 1. Single source of truth for "ICA complete"
Add a small helper `src/lib/icaCompletion.ts`:

```ts
export function isIcaComplete(os: { ica_status?: string | null }, contract?: { status?: string | null; contractor_signed_at?: string | null } | null) {
  if (os?.ica_status === 'complete') return true;
  if (contract?.status === 'fully_executed') return true;
  if (contract?.contractor_signed_at) return true;
  return false;
}
```

Use this anywhere we currently compare `ica_status === 'sent_for_signature'` to decide between action-required and complete states.

### 2. Flip `ica_status` on driver acknowledgment
In `DriverICAAcknowledgment.tsx`, after the successful `ica_driver_acknowledgments` insert:

- Look up the operator row tied to this `contract_id` (via `ica_contracts.operator_id`).
- `update onboarding_status set ica_status = 'complete' where operator_id = ...`.
- Best-effort, swallow errors so the ack still records.

This makes the existing realtime channel push the change to the portal automatically.

### 3. UX swaps (Part 2) — gated on `isIcaComplete`
- `src/pages/operator/OperatorPortal.tsx`
  - Top "Action Required — Sign Your ICA Agreement" banner (~L1314): when complete, render a green success banner: "ICA Agreement Signed — Thank You!" with a secondary "View Signed Agreement" button that switches to the ICA view.
  - Bottom sticky "Sign Your ICA Agreement" action card (~L856/L945): when complete, hide it (no longer action-required) or replace with a subdued "View Signed Agreement" link.
  - ICA Status field (~L725): show "Signed" + `status: 'complete'` when complete.
  - ICA tab red dot (~L916): set `icaDot = false` when complete.
- `src/components/operator/SmartProgressWidget.tsx`
  - Stage 3 card: when complete, drop ACTION REQUIRED styling, mark both sub-steps done (already true for "prepared by coordinator"; flip "ICA signed by you" via the same predicate), and change `ctaLabel` to "View Signed Agreement" routing to the ICA tab.
- `src/components/operator/OnboardingChecklist.tsx`
  - `showIcaCTA` (L146) and the "Sign ICA Agreement" button (L269): when complete, badge becomes COMPLETE and the button label becomes "View Signed Agreement" linking to the ICA tab.

All five surfaces share the new `isIcaComplete` helper so we cannot regress one without the others.

### 4. Verification
- Manual: as Emma (non-owner driver path), open the ICA tab, check the box, click "Record Acknowledgment". Expect:
  - Toast confirms ack.
  - Within ~1s, top banner becomes green "ICA Agreement Signed", bottom red sticky disappears, Stage 3 card flips to COMPLETE, ICA Status reads "Signed", ICA tab dot clears.
- Owner-operator path (existing): re-test signing through `OperatorICASign` still flips everything (no behavioral regression).
- DB check: `select ica_status from onboarding_status where operator_id = ...` returns `complete` immediately after ack.

## Technical notes
- No schema changes. No new migrations.
- No edge-function changes.
- `ica_driver_acknowledgments` already has the right RLS for drivers to insert their own row; the new `onboarding_status` update will run under the same authenticated session. If RLS blocks the driver from updating their own `onboarding_status.ica_status`, fall back to a SECURITY DEFINER RPC `mark_ica_complete_for_driver(contract_id uuid)` — confirmed during implementation by attempting the direct update first and switching to the RPC only if it errors.
- All "view signed agreement" actions reuse the existing `view='ica'` route — no new viewer needed.
