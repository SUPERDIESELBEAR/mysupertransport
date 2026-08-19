# Pass 2B — Driver Assignment on Load Detail

Adds driver assign / reassign / unassign to the Load Detail page, backed by a server-side eligibility check and a company-level setting. Pass 1 and 2A sections stay as they are.

## What gets built

**1. Company settings table**
New `company_settings` table (key/value JSON) so future operational settings share one home. Seeded with `auto_cover_on_driver_assignment = true`, described as: assigning a driver to an `available` load auto-advances it to `covered`; carriers with a separate brokerage or load-planning team may want it off so assignment and status stay independent.

Access: management/owner read + update, dispatcher/onboarding staff read only, operators none. `updated_at` and `updated_by` stamped by triggers.

**2. Eligibility check**
`check_driver_assignment_eligibility(operator_id, load_id)` returns `{ eligible, issues[], warnings[] }`.

Blocking: operator not active; operator flagged `excluded_from_dispatch`; CDL expired; medical card expired; annual DOT inspection past due; truck registration (IRP cab card) expired.

Warnings: driver already on another load in `covered` … `pod_received` (names the load number); any of the above documents expiring within 14 days.

Data sources confirmed in the current schema: `operators.is_active`, `operators.excluded_from_dispatch`, `inspection_documents.expires_at` for the per-driver `CDL (Front)`, `Medical Certificate` and `IRP Registration (cab card)` rows (falling back to `applications.cdl_expiration` / `applications.medical_cert_expiration` when no document row exists), and `truck_dot_inspections.next_due_date` for the annual DOT inspection. Equipment-type matching is skipped as instructed. If a document row is simply missing, that check is reported as "not on file" as a warning rather than a hard block, since a missing record is not the same as an expired one.

**3. Assignment functions**
`assign_driver_to_load(load_id, operator_id, override_reason)`:
- caller must hold dispatcher, management or owner
- blocking issues with no override reason → raises, listing them
- blocking issues with an override reason → management/owner only; dispatchers are refused
- sets `operator_id` and `updated_by`
- if `auto_cover_on_driver_assignment` is on and status is `available`, advances to `covered` so the existing history trigger fires; an override reason is carried into that history note
- every override writes an `audit_log` entry (load, operator, caller, reason)
- returns `{ success, auto_advanced, warnings[] }`

`unassign_driver_from_load(load_id, reason)`: same roles, requires a non-empty reason, clears `operator_id`, writes an audit entry, leaves status untouched.

**4. UI**
Inside the existing Load Summary driver field. Dispatcher/management/owner see `Assign Driver`, or the name plus `Reassign` / `Unassign`. Onboarding staff and operators see the name only.

The assign dialog uses the existing shared `DriverCombobox` (searchable by name and unit number, active drivers). Selecting a driver runs the eligibility check immediately and shows the result inline: green when clean, amber panel listing warnings with confirm still enabled, red panel listing blocking issues — disabled confirm plus "management access required" helper text for dispatchers, or an override-reason textarea for management/owner that enables confirm once filled. Success toast mentions the auto-advance to Covered when it happened.

Unassign uses a small dialog requiring a reason.

**5. Refresh and errors**
Invalidates the load detail, status history and loads list queries. Failures go through `getDbErrorMessage` / `logDbError`.

**6. Formatter fix**
`formatEnumLabel` gains acronym-aware casing so `manual_ui` renders "Manual UI" (and UI, POD, ELD, DOT, CDL, IRP, MC, TONU, BOL benefit everywhere the formatter is used).

**7. Tests**
Extends `loadDetailOperatorAccess.test.tsx`: an operator sees the driver name but no Assign/Reassign/Unassign controls, and `assign_driver_to_load` is pinned to raise for operator-only callers (same migration-source assertion style used for `update_load_status`). Failing assertions get reported, not loosened.

## Technical notes

- Files touched: new migration; `src/lib/loadFormat.ts`; `src/lib/loadDetail.ts` (assign/unassign/eligibility helpers); `src/components/dispatch/loadDetail/LoadSummaryCard.tsx`; new `AssignDriverDialog.tsx` and `UnassignDriverDialog.tsx` under `loadDetail/`; the existing test file.
- All new functions: `SECURITY DEFINER`, `SET search_path = public`, EXECUTE revoked from `public`/`anon`, granted to `authenticated`.
- No structural changes to `loads`, `operators` or `load_status_history`.
- shadcn components only; charcoal/gold tokens, no hardcoded colors.
