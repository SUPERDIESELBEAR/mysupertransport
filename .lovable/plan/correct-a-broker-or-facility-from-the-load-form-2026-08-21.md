# Correct a broker or facility from the load form

Both reference records can be picked on the load form but not fixed there. Add a small, role-gated edit action next to the selected record in each case, reusing the existing dialogs.

## 1. Broker field

`BrokerSelect` currently fetches a thin list (`id, company_name, mc_number`) via its own query, which is not enough to prefill `BrokerDialog` in edit mode. Switch it to the shared `useBrokers()` hook, which returns the full broker record plus `load_count` — the same data the Brokers page uses, so the dialog gets identical values.

- When a broker is selected, render a small ghost pencil button beside the picker (outside the dropdown), labelled `Edit broker details` for screen readers.
- Clicking it opens `BrokerDialog` with `broker={selected}` and `loadCount={selected.load_count}`. Edit mode already exists and already excludes the record from its own duplicate check.
- On save, invalidate the brokers query and keep the same `broker_id` selected; the trigger label re-renders with the corrected name automatically.
- `canDelete` is passed as `false` here — deleting a broker mid-load makes no sense; that stays on the Brokers page.

## 2. Facility field on stops

Extend the existing "differs from saved facility" path rather than adding a second one. Today it offers only a blind `Update saved facility` write of the stop's current values.

- Add an `Edit saved facility` action next to the facility picker whenever the stop has a `facility_id` — visible whether or not the stop drifted.
- It opens `FacilityDialog` with `facility={linked}` (edit mode, already supported). On save, run the existing `applyFacility` handler with the returned record so the stop's fields refresh from the corrected facility and stay linked.
- The current `Update saved facility` quick action stays where it is: it is the reverse direction (push the stop's typed values up to the facility) and is still the faster path when the dispatcher has already corrected the stop inline. The new action is for correcting fields the stop does not carry (email, hours, access notes, type) or for reviewing before writing.

## 3. Role gating

Both actions are hidden unless the signed-in user holds a role that can write to the record. Per the existing table policies that is management, owner, dispatcher, or onboarding staff — read from `useAuth` (`isManagement || isDispatcher || isOnboardingStaff`, which already includes owner). Operators never see either action. This is a UI affordance only; RLS remains the enforcement boundary.

## 4. Dirty state

- Both buttons are `type="button"` so they never submit the form.
- Opening either dialog touches no form field, so `form.formState.isDirty` is unchanged and the load form's `useUnsavedChanges` guard does not fire.
- The dialogs render inside the form's React tree but as Radix portals, so no nested-form or focus-restore side effects.
- Saving a broker does not touch the load form at all. Saving a facility calls `applyFacility`, which does mark the form dirty — correct, since the stop's values genuinely changed and must be saved with the load.

## Technical notes

Files touched: `src/components/dispatch/loadForm/BrokerSelect.tsx` (shared hook, edit affordance), `src/components/dispatch/loadForm/StopsSection.tsx` (facility edit affordance + dialog wiring). `BrokerDialog.tsx` and `FacilityDialog.tsx` are unchanged — both already support edit mode. No schema, RPC, or edge-function change.

Tests: extend the existing load-form test files to assert the edit action appears for a dispatcher with a broker selected, is absent with no selection, and is absent for an operator role.
