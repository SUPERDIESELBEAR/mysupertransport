When archiving (deactivating) an operator who is currently On Hold, pre-fill the deactivation reason field with the existing on-hold reason and the "since" date so management doesn't retype it. The text stays fully editable before confirming, and the saved comment continues to flow through to the archived driver profile (where it's already editable today via `ArchivedDriversView`).

### Behavior
- Opening the Deactivate dialog while `isOnHold` is `true`:
  - Pre-populate `deactivateReason` with: `On Hold since {Mon D, YYYY}: {on_hold_reason}`
  - The dropdown will resolve to "Other" automatically (combined string doesn't match presets), revealing the editable textarea pre-filled with that string.
  - Staff can append/edit freely before confirming.
- If the operator is not on hold, behavior is unchanged (blank dropdown).
- On confirm, the reason is written to `audit_log.metadata.reason` exactly as today, so it surfaces and remains editable on the archived driver profile (no changes needed to `ArchivedDriversView`).
- Re-opening the dialog after cancel resets to the prefill again (canceling clears state currently — keep that behavior, but reseed on next open).

### Files to edit
- `src/pages/staff/OperatorDetailPanel.tsx`
  - Update the Deactivate button `onClick` (~line 2173) to seed `deactivateReason` from on-hold context when `isOnHold` is true, before opening `showDeactivateConfirm`.
  - Keep cancel behavior (clearing on close) intact so the next open reseeds fresh from current on-hold values.

No database, RLS, or archived-view changes required.