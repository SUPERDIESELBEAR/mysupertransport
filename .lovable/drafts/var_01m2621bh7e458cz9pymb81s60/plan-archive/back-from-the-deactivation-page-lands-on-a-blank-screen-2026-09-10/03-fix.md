## The fix

One change, in the management screen only:

- When the page opens with the driver profile as the named destination and a driver ID present, select that driver straight away — instead of skipping it, which is what happens now.
- Keep today's behaviour for every other destination: a driver ID alongside another destination (driver logs, for example) is still left for that screen to use.
- Safety net: if the driver profile is asked for with no driver at all, fall back to the Driver Hub list rather than showing an empty page. This mirrors how the load edit screen already falls back to the loads list.

Nothing changes in the deactivation wizard itself, and no data or backend work is involved.

## Technical notes

`src/pages/management/ManagementPortal.tsx`:

- Seed `selectedOperatorId` from `?op=` in the lazy `useState` initialiser (same pattern already used for `selectedLoadId`), so the first render of `view === 'operator-detail'` has an operator.
- In the mount deep-link effect, allow `openOperatorDetail(op)` when `urlView === 'operator-detail'`; keep the existing skip for other explicit views.
- Add an effect mirroring the `load-edit` guard: `if (view === 'operator-detail' && !selectedOperatorId) setView('drivers')`.

## Verification

Drive it headlessly as the owner: open a driver, start Deactivation & Delease, click the header Back and the in-page "Back to driver", and confirm the driver profile renders both times with the correct name and unit. Also confirm a plain `?view=eld-logs&op=…` link still lands on Driver Logs, not the profile.
