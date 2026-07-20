
# ICA Amendments — Add / Replace Truck Unit

Currently each operator has one `ica_contracts` row storing a single truck's specs. Once signed, staff have no clean way to add a second unit or swap a totaled/sold truck for a new one — which is what Mae hit with Ian Dunfee.

This adds a formal **Amendment** flow attached to the original ICA. The original signed contract is never modified. Each add/replace produces a numbered, separately-signed Equipment Schedule Amendment.

## User-facing flow (staff)

In the operator's Onboarding Pipeline card and in the Fleet Detail Drawer, add an **ICA Amendments** section under the ICA status. It lists any existing amendments (number, effective date, action, unit VIN/plate, status pill).

A single **"Amend ICA"** button opens a modal with two actions:

- **Remove & Replace Unit** — pick which current unit to retire, enter new unit specs, effective date.
- **Add an Additional Unit** — enter new unit specs, effective date. Original unit(s) remain.

Save creates a draft amendment. Staff review, then **Send to Operator** — operator gets an email/push and signs in-app just like the original ICA. Once signed, carrier countersigns from the existing carrier signature settings, and the amendment becomes **Effective**.

On effective:
- New unit is added to the operator's active-units list.
- If Replace: removed unit is archived on the ICA and a **Lease Termination** record is auto-created for that unit (partial termination) with reason "unit_replaced".
- Fleet Roster, Vehicle Hub, MO Plate Registry, and onboarding_status truck fields update to reflect the operator's **currently active** unit(s).

## Rules

- Amendments are numbered per operator (Amendment #1, #2…).
- Amendments require an original ICA in `signed`/`active` status. Void ICAs cannot be amended.
- An operator can have at most one **pending** amendment at a time.
- Removed units are retained forever on the amendment history for audit.
- The Amendment PDF reuses the ICA template but with an "Equipment Schedule Amendment" header, references the parent ICA number and date, and shows the delta (unit added / unit removed).
- Full audit-log entries on create, send, sign, countersign, and effective.

## Technical details

**Schema (new tables via one migration, with GRANTs + RLS):**
- `ica_amendments` — parent record. Columns: `id`, `operator_id`, `parent_ica_id` (FK ica_contracts, ON DELETE RESTRICT), `amendment_number` (int, unique per operator), `action` (`add_unit` | `replace_unit`), `effective_date`, `status` (`draft` | `sent_to_operator` | `operator_signed` | `active` | `voided`), `operator_signature_url`, `operator_signed_at`, `carrier_signature_url`, `carrier_signed_at`, `carrier_signed_by`, `created_by`, `notes`, timestamps.
- `ica_amendment_units` — one row per unit affected. Columns: `id`, `amendment_id` (FK), `change_type` (`added` | `removed`), `unit_number`, `truck_year/make/model/vin/plate/plate_state`, `trailer_number`.

**Backfill:** on migration, insert one implicit "unit_number 1" row per existing ICA into a new `ica_units` view/table so we can reason about "currently active units" uniformly. Simpler alternative kept in scope: derive current units from parent ICA fields + all `active` amendments in application code — no `ica_units` table required.

**Triggers:**
- On `ica_amendments.status → 'active'`:
  - Update `operators.unit_number` / `onboarding_status` truck fields to the **primary** active unit (staff picks primary if multiple).
  - If `action = 'replace_unit'`: insert a `lease_terminations` row with the removed unit's specs, `reason = 'unit_replaced'`, `ica_contract_id = parent_ica_id`, `partial_termination = true`, `unit_removed_vin = ...`.
  - Log to `audit_log`.
- Reuse `sync_ica_completion_to_onboarding` cascade flag pattern to avoid tripping self-update guards.

**Frontend files:**
- New `src/components/ica/ICAAmendmentBuilderModal.tsx` — the Add/Replace modal (mirrors `ICABuilderModal` structure).
- New `src/components/ica/ICAAmendmentList.tsx` — history strip shown under ICA status.
- New `src/components/ica/ICAAmendmentViewModal.tsx` — preview + PDF + signatures.
- New `src/components/operator/OperatorICAAmendmentSign.tsx` — driver-side signature screen; routed at `/operator?view=ica-amendment&id=…`.
- `src/pages/staff/OperatorDetailPanel.tsx` — mount amendment list + button in Stage 6 / ICA area.
- `src/components/fleet/FleetDetailDrawer.tsx` — show active units + amendment history.
- `src/lib/truckSync.ts` — extend to write against the "primary active unit" for the operator instead of blindly mirroring to the ICA row; leave signed ICA row immutable.
- `src/components/fleet/FleetRoster.tsx`, `src/components/mo-plates/MoPlateRegistry.tsx` — surface all active units per operator (multi-unit operators).

**Edge functions:**
- New `send-ica-amendment` — email operator with tokenized amendment link (reuses ICA email template + carrier signature settings). Also emits push notification.
- Reuse existing `send-lease-termination` path for auto-generated terminations on Replace.

**Security:** RLS on both new tables — operator can read/sign their own amendments; staff (management/owner roles) can create/send/void; carrier signature limited to users with carrier-signer role, same as current ICA.

**Audit + notifications:**
- Emit `notifications` rows (Action tier) to the assigned pipeline staff on operator signature.
- Emit birthday-style Action popup to owner on any Replace, since it changes lease composition.

## Out of scope (flag for later)

- Bulk mass-amend (multi-operator) — not needed now.
- Editing carrier split % via amendment — split remains on the parent ICA.
- Backfilling historical unit changes that were done manually before this feature ships.
