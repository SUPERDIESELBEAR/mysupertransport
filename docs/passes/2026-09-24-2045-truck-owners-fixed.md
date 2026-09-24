# Truck owners fixed — own work, many trucks, linking invite, owner reads

Build mode. 2026-09-24 20:45 UTC. Immutable: append only.

## A. Decisions recorded
P57–P61 appended to `docs/tms-build-status.md`.

## B. Many trucks — migration 0064
- Dropped `truck_owners_user_id_key`; added `truck_owners_user_id_operator_id_key UNIQUE(user_id, operator_id)`. Kept `truck_owners_operator_id_key` and `operators_user_id_key`. Undo is in the migration comment.
- `current_company_id()` unchanged: a throwaway owner holding two rows resolved to the one carrier (`6b54d0e6-…`).

## C. The app
- New `useOwnedTrucks` (reads every row, never `.maybeSingle()`) and "My trucks" switcher.
- Owner-driver defaults to his own driver app; switching to an owned truck fills the screens with that truck's driver's data. Choice kept per login in the session. Pure owner lands on My trucks.
- `OperatorICASign` takes the unit and whether it is his own truck: own truck → contractor; owned truck → lessor; hired driver of an owned unit → read-only.
- Fuel screen for an owned truck shows a plain notice: the fuel screen reads only the signed-in driver's own purchases. The owner read policy exists (E); an owner fuel screen is not built. Settlements unchanged (P58; owner settlements in the Alvys milestone).

## D. The invite (deployed)
Live calls as Mae, throwaway drivers at SUPERTRANSPORT:
```
A same-carrier driver D2 -> U1        200 linked_existing=true ica_notice_sent=false
B same owner D2 -> second truck U3    200 linked_existing=true
C staff login -> UX                   409 "…has a staff login. A staff login cannot be a truck owner…"
D unit's own driver D1 -> U1          409 "…a driver cannot be his own truck owner…"
auth users before/after: 186 186      (no new account, no account email)
```
NOT PROVEN LIVE: the other-carrier refusal. Proving it needs a second committed carrier, which the probe rule forbids. The branch exists (operators/truck_owners/applications company check) and is established by code reading only. The ICA-ready notice branch (unit awaiting signature) was not exercised: throwaway units had no ICA status.

## E. Owner SELECT policies
`Truck owners view their drivers' binder docs` (inspection_documents), `loads_truck_owner_read`, `fuel_transactions_truck_owner_read` — all SELECT, via `is_truck_owner_for_operator`. Raising proof (rolled back):
```
D2 owner    | loads=TP-L1,TP-L3 | fuel=TP-F1,TP-F3 | binder=TP-B1,TP-B3 | ica_units=2 | owned=2
D1 driver   | loads=TP-L1 | fuel= | binder=TP-B1 | ica_units=1 | owned=0
D3 driver   | loads=TP-L3 | fuel= | binder=TP-B3 | ica_units=1 | owned=0
DX outsider | loads=TP-LX | fuel= | binder=TP-BX | ica_units=0 | owned=0
```
Neither hired driver sees the other's truck; the outsider sees neither.

## Read-only David Mitchell / Kevin Foy (impersonated reads in a rolled-back block; no writes, no browser sign-in)
```
David Mitchell | own_operator=189d5ff3 | owns_operator=e1d4cea5 | operators_visible=e1d4cea5,189d5ff3 | binder_docs 820157e8:7,e88b6367:7
Kevin Foy      | own_operator=e1d4cea5 | owns_operator=        | operators_visible=e1d4cea5          | binder_docs e88b6367:7
```
David's app now defaults to his own unit (189d5ff3) and can switch to Kevin's; Kevin sees only his own. A screenshot of David's app was not taken.

## Residue
Four throwaway logins, operators, roles, owner links, profiles and two audit rows removed. Quoted: truck_owners 6, TP operators 0, TP profiles 0, TP roles 0, TP audit 0 (after delete), TP loads 0.

## Guard updated
`fuel-import-live`: the owner fuel policy is excepted by exact name, command and expression.

## Suite and typecheck
Full suite `--maxWorkers=2`: `Test Files 3 failed | 220 passed | 2 skipped (225)`, `Tests 3 failed | 2229 passed | 16 skipped (2248)`. The failures: fuel guard (real, fixed above); billing-schema and permission-wrapper were the known pooler EAUTHQUERY timeout. Rerun of all three: 58 passed. `tsgo --noEmit` clean after one missing-import fix.

Michael Underwood NOT linked to Kirt Frazer's unit; staff do that through the fixed invite.
