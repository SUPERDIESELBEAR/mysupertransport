# Active-Operator Population Report (investigation only)

Nothing was changed. All figures are live reads taken 2026-08-29. The only proposed
change is recording this report in `docs/tms-build-status.md` as a findings section.

## Headline counts

- 61 operators with `is_active = true` (0 of them demo).
- 46 have `onboarding_status.fully_onboarded = true`; 15 do not.
- 11 have `excluded_from_dispatch = true` — all 11 with a NULL reason.
- 35 appear on the dispatch board as dispatchable rows (fully onboarded AND not excluded).
- 61 - 35 = **26 active operators off the board** (your 27 is off by one; the board's
  own row filter is `fully_onboarded`, and exclusion only removes them from the
  dispatchable list).

## 1. The off-board population, grouped

**Group A — mid-onboarding, never live (15).**
Christopher Harris, Daniel Vazquez Gonzalez, Dario Hamilton, Jeffery Oliver, Jonathan
Grant, Laudel Zequeira Villafranca, Mel Smith, Michael Campbell, Michelle Watts,
Reginald Blue, Robert Carpenter, Robert Patrick, Ruben Reyes Islas, Shawn Bresett,
Shawn Bresett Jr.
Evidence: `fully_onboarded = false`, `go_live_date` NULL, zero loads ever, zero open
equipment assignments, zero `lease_terminations` rows. 5 of them are `on_hold`
(Harris, Oliver, Zequeira, Smith, Watts). Shawn Bresett Jr also has a `truck_owners`
row — he is an owner record, not a driver in progress.

**Group B — onboarded but excluded from dispatch (11).** All have a `go_live_date`;
none has a recorded exclusion reason.
- Departed, termination on file, still active: **Bilal Leggett** (2026-07-24),
  **Ronald Lockett** (2026-08-10), **Willie Westbrook** (2026-08-14). Each still holds
  2-3 open equipment assignments.
- Parked with equipment still out: Cortez Nelson (3), Damian Anderson (3),
  Timothy Rainey (4), David Mitchell (1), Craig Pate (2, and holds 1 load).
- Owner-linked: Bilal Leggett, Jamian Anderson have `truck_owners` rows.
- Emma Mueller — `on_hold`, no equipment, no loads (staff/test-shaped record).
- Progress Loyd — go-live 2025-06-30, no equipment, no loads.

## 2. Six terminated drivers who are still fully on the board

`lease_terminations` rows whose operator is still `is_active = true`: **9**
(22 more belong to already-deactivated operators). Only 3 of the 9 are excluded from
dispatch, so **6 sit on the board as ordinary dispatchable drivers**.

| Driver | Termination | Reason / note | Excluded | Dispatch status | Last daily log | Equipment still out | Loads |
|---|---|---|---|---|---|---|---|
| Ian Dunfee | 2026-07-17 | cause — "Truck and trailer down" | no | home | 2026-08-29 | eld, dash_cam, fuel_card | 0 |
| Vino Huddleston | 2026-07-27 | cause — "Truck down" | no | home | 2026-08-30 | eld, dash_cam, fuel_card | 0 |
| Dale Erickson | 2026-08-05 | cause — "Truck issue" | no | dispatched | 2026-08-28 | eld, dash_cam, fuel_card | 0 |
| Steve Figueroa | 2026-08-10 | cause — "temporarily remove need personal time off" | no | dispatched | 2026-08-31 | eld, dash_cam, fuel_card | 0 |
| Steven Fifer | 2026-08-10 | cause — "on vacation" | no | dispatched | 2026-08-28 | eld, dash_cam, fuel_card | 0 |
| Calvin Herrera | 2026-08-10 | cause — "truck issue" | no | dispatched | 2026-08-31 | eld, dash_cam, fuel_card | 0 |
| Bilal Leggett | 2026-07-24 | mutual | yes | home | 2026-07-09 | eld, dash_cam | 0 |
| Ronald Lockett | 2026-08-10 | cause — "Truck issue" | yes | home | 2026-08-10 | eld, dash_cam, fuel_card | 0 |
| Willie Westbrook | 2026-08-14 | mutual | yes | home | 2026-08-31 | eld, dash_cam, fuel_card* | 0 |

*Westbrook's fuel card assignment was closed; he holds eld + dash_cam.

Plainly, per your three categories:
- **Left and returned / never actually left:** Dunfee, Huddleston, Erickson, Figueroa,
  Fifer, Herrera. The termination notes say "truck down", "vacation", "personal time
  off" — the lease-termination document was used as a *temporary parking* mechanism.
  All six are still logging dispatch activity after the effective date (four are
  `dispatched` right now), so treating a `lease_terminations` row as "departed" would
  wrongly exclude six working drivers.
- **Left and not closed out:** Leggett, Lockett, Westbrook. Excluded from dispatch,
  no dispatch activity since the effective date, equipment never returned, `is_active`
  never flipped, no signed contractor copy, no PDF, insurance never notified
  (`contractor_signed_at`, `pdf_url`, `insurance_notified_at` are NULL on **all nine**).
- **No unsettled money can be reported:** there is no settlement layer yet — the only
  matching table in the database is `forecast_deductions`. No `settlements`,
  `rm_deposits`, `cash_advances`, or `deductions` tables exist, so R&M balances,
  advances, and negative carry-forward do not exist for anyone, departed or not.

## 3. Every "active operator" definition in the codebase

| Call site | Predicate |
|---|---|
| `src/lib/managementMetrics.ts` `isEligibleDriver` + `fetchOverviewMetrics` | `is_active = true` AND `!is_demo` AND `user_id NOT IN OWNER_USER_IDS` |
| `src/pages/dispatch/DispatchBoardPage.tsx` | `is_active <> false`, rows filtered to `onboarding_status.fully_onboarded`; `dispatchable = !excluded_from_dispatch && is_active !== false` |
| `src/pages/dispatch/DispatchPortal.tsx` | fully onboarded, then split into `excludedOnboarded` / `includedOnboarded` |
| `src/pages/management/ManagementPortal.tsx` (Compliance) | `is_active && fully_onboarded && past go_live_date && insurance_added_date` |
| `src/pages/management/ManagementPortal.tsx` (roster count) | `is_active && fully_onboarded && !is_demo` |
| `src/pages/management/ManagementPortal.tsx` (dispatch cards) | `active_dispatch` join, `!excluded_from_dispatch && fully_onboarded` |
| `src/pages/staff/StaffPortal.tsx` | `fully_onboarded = true` only |
| `src/pages/staff/PipelineDashboard.tsx` | `!fully_onboarded || stage5 open`; deactivate writes `is_active = false` |
| `src/pages/dispatch/LoadsListPage.tsx`, `FuelImportPage.tsx`, `payTreatment.ts` | `is_active = true` only |
| DB `check_driver_eligibility` | blocks on `is_active IS NOT TRUE` and on `excluded_from_dispatch`, plus CDL/med/IRP/DOT expiry |
| `supabase/functions/rollover-dispatch-status` | `operators.excluded_from_dispatch = false` only |

Seven materially different predicates; `lease_terminations` appears in none of them.

## 4. Truck owners vs drivers

`truck_owners` is a separate table keyed one-to-one on `operator_id`, with its own
`user_id` and the `truck_owner` role in `useAuth`. 5 rows exist. In **all 5** the
owner's `user_id` differs from the operator's `user_id` — so today owner and driver
are always different people, though the schema does not forbid them being the same.
**All 5 owner-linked operators have never held a load.** The operator record is the
lease/truck; the driver identity is `operators.user_id`.

## 5. Load history

Across the whole `loads` table only **2 operators** have ever been assigned a load,
and both are current holders. So of the 61 active operators, 2 have ever held a load
and 2 hold one now — load data is effectively pre-production.

## 6. Equipment return: is there a home for "management confirms the set is back"?

- `equipment_assignments.returned_at` / `returned_by` — 276 assignments, 117 returned.
  Set by the Deactivation Wizard (`DeactivationWizardContent.tsx`), which stamps
  `returned_at` and also flips `operators.is_active = false`.
- `equipment_receipts` — shipping receipts, `direction` inbound/return, uploaded by
  driver or management. 3 return receipts exist. Trigger
  `mark_equipment_return_completed` stamps `onboarding_status.equipment_return_completed_at`
  on the first return receipt.
- `onboarding_status` also carries `*_awaiting_return_shipment` flags per device,
  `return_instructions_sent_at/by`, `equipment_return_date`, `equipment_return_notes`.
- `operator_offboarding_steps` has an `equipment_return` step — 7 operators have step
  rows and **0 have `equipment_return` completed**.

A home exists, but it records *shipment*, not *receipt inspection*: the "completed"
stamp fires as soon as a driver uploads a tracking receipt, before anything is
physically checked in. There is no field for "management confirms the set is back",
and `mark_equipment_return_completed` is a driver-triggered write. That gap is real.

## Proposed change

Add the above as a dated findings section in `docs/tms-build-status.md`. No code,
schema, or data changes.
