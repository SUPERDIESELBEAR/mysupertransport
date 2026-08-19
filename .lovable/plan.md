# Pass 2B — Driver Assignment on Load Detail

Makes the Driver field in Load Summary interactive, backed by a server-side assignment function with compliance validation. Pass 1 and Pass 2A sections are otherwise untouched.

## 1. Where the setting lives

New `company_settings` table rather than new columns on `load_number_config`. `load_number_config` is a load-numbering concern (prefix, sequence, padding) and this setting is dispatch behavior; mixing them would make the numbering table a catch-all. `company_settings` is a small key/value table that future operational settings can share.

- `setting_key` (unique text), `setting_value` (jsonb), `description`, `updated_at`, `updated_by`
- Seeded with `auto_cover_on_assignment = true` for SUPERTRANSPORT, described as: when on, assigning a driver to an `available` load advances it to `covered`; carriers with a brokerage arm where a separate team builds loads may turn it off so assignment and status stay independent.
- RLS: management and owner select + update; dispatcher and onboarding staff select only; operators no access. Grants to `authenticated` and `service_role` only. `updated_at` / `updated_by` stamped by triggers.

## 2. Server-side functions

`public.check_driver_eligibility(p_operator_id uuid)` — read-only, returns `{ eligible, blocking[], warnings[] }` with plain-language messages including dates ("Medical card expired on March 3, 2026").

Blocking: operator not active; `excluded_from_dispatch`; `on_hold`; CDL expired; medical card expired; truck annual DOT inspection expired; truck registration expired.

Warnings: operator already assigned to another load in a non-terminal status (names the load number); any of those documents expiring within 14 days.

Schema sources confirmed in the current database: `operators.is_active`, `operators.excluded_from_dispatch`, `operators.on_hold`, `inspection_documents.expires_at` for the per-driver `CDL (Front)`, `Medical Certificate` and `IRP Registration (cab card)` rows (falling back to `applications.cdl_expiration` and `applications.medical_cert_expiration` when no document row exists), and `truck_dot_inspections.next_due_date` for the annual inspection. A missing document (never uploaded) is reported as a warning, not a hard block, since absent is not the same as expired — called out in the UI text.

A thin companion `public.check_driver_eligibility_bulk(p_operator_ids uuid[])` returns the same payload keyed by operator so the dialog can render one indicator per row in a single round trip instead of one call per driver.

`public.assign_load_driver(p_load_id uuid, p_operator_id uuid, p_override_reason text)`:
- caller must hold dispatcher, management or owner, else raise
- runs the eligibility check; blocking failures with no override reason raise a single exception listing every failed check so the UI shows them all at once
- blocking failures with an override reason require management or owner; a dispatcher attempting it raises
- sets `loads.operator_id` and `updated_by` via `public.current_profile_id()`
- when `auto_cover_on_assignment` is true and status is `available`, advances to `covered`, letting `log_load_status_change` fire, then updates that history row with a note that the status advanced automatically on driver assignment and `change_source = 'auto_assignment'`
- on override, writes an `audit_log` row with load id, operator id, failed checks, reason and acting profile id
- returns `{ success, auto_advanced, warnings[] }`

Unassignment is handled by a matching `public.unassign_load_driver(p_load_id uuid)` with the same role gate; it clears `operator_id` and returns a JSONB result with any warnings. Status handling mirrors assignment:
- When `auto_cover_on_assignment` is true and the load is currently `covered`, the status reverts to `available` so the dispatch board never shows a covered load with no driver. The existing `log_load_status_change` trigger fires, then that history row is updated with a note that the load was returned to available on driver unassignment and `change_source = 'auto_unassignment'`.
- When the load has progressed past `covered` (`dispatched`, `in_transit` or later), the status is left alone — real activity exists against it and the dispatcher should resolve it explicitly — and the response carries a warning so the UI can surface it.
- When `auto_cover_on_assignment` is false, the status is never reverted, since that configuration intentionally decouples status from assignment.

All functions: `SECURITY DEFINER`, `SET search_path = public`, EXECUTE revoked from `public` and `anon`, granted to `authenticated`.

## 3. UI

Driver field in Load Summary becomes interactive for dispatcher, management and owner: `Assign Driver` when empty, otherwise the name plus `Reassign` and `Unassign`.

The dialog uses the existing shared searchable driver combobox pattern, with an inline eligibility indicator per operator — green check when clear, amber when warnings, red when blocking. Selecting an operator opens a detail panel listing issues and warnings in plain language.

- No blocking issues: `Assign Driver` confirm button.
- Blocking issues, management or owner: an override section with a required reason and a destructive `Override and Assign` button.
- Blocking issues, dispatcher: confirm disabled, helper text that management approval is required to override.

Unassign uses its own confirmation dialog. Its toast reports the outcome: that the load was returned to Available, or the warning that the load is past Covered and its status was left unchanged for the dispatcher to resolve.

Onboarding staff see the driver name with no controls. Operators see their assigned driver name only — no controls, no eligibility data about themselves or anyone else, and no eligibility calls issued.

## 4. Refresh, errors, formatter

Success invalidates the load detail, status history and loads list queries and toasts the assigned driver's name, mentioning the automatic advance to Covered when it happened. Failures go through `getDbErrorMessage` and `logDbError`.

`formatEnumLabel` gains acronym-aware casing so `manual_ui` renders "Manual UI" and `auto_assignment` renders sensibly, with UI, POD, ELD, DOT, CDL, IRP, MC, BOL and TONU handled for every caller.

## 5. Tests

Extends `loadDetailOperatorAccess.test.tsx`:
- an operator viewing their own load sees the driver name but no Assign / Reassign / Unassign controls
- `assign_load_driver` is pinned to raise for operator-only callers
- the migration source is pinned to show a dispatcher cannot override a blocking check while management and owner can

Same principle as before: a failing assertion gets reported, not loosened.

## Files

New migration; `src/lib/loadFormat.ts`; `src/lib/loadDetail.ts` (assign / unassign / eligibility helpers); `src/components/dispatch/loadDetail/LoadSummaryCard.tsx`; new `AssignDriverDialog.tsx` and `UnassignDriverDialog.tsx` under `loadDetail/`; the existing test file. No structural changes to `loads`, `operators` or `load_status_history`. shadcn components only, charcoal/gold tokens.
