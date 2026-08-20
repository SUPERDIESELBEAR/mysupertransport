# Load Editing

Replaces the "coming soon" Edit Load button with a real edit mode built on the existing Create Load form.

## Two decisions you asked about first

### 1. Change history storage — recommend a dedicated `load_change_history` table

`audit_log` is a general activity log with columns `actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata (jsonb), created_at`. It has no per-field previous/new columns, so a field-level diff would have to live inside `metadata` and be unpacked in the client, and rendering a per-load history means filtering a table that every other module writes to. A dedicated table gives one row per changed field with typed columns, a clean `load_id` index for the Load Detail section, and RLS that excludes operators outright — matching how `load_status_history` and `claim_flag_history` already work.

The owner unlock action still writes to `audit_log` as you specified (it is a permission event, not a field diff).

### 2. Removing a stop that has a charge attached

Proposal: never silently delete revenue. When a stop with a charge amount is removed, show a confirm dialog with two choices:

- **Keep the charge on the load** (default) — the `load_charges` row survives with `load_stop_id` set to null, so it stays in Total Load Value as a load-level charge.
- **Remove the charge too** — deletes the row and reduces the total; the dialog states the new total.

Cancelling leaves the stop in place. The same rule applies server-side: the update function nulls `load_stop_id` on any charge whose stop disappears unless the client explicitly omitted the charge.

## Editing behaviour

Edit mode reuses `CreateLoadPage` (renamed internally to a shared load form) with a `loadId` prop. It loads the load, stops, and charges, hydrates the same react-hook-form values, and on save calls an update RPC instead of `create_load_with_stops`. The create path keeps its current behaviour exactly.

Routing follows the existing dual-portal pattern: `/dispatch/loads/:id/edit` for Dispatch, a `load-edit` view in the Management Portal.

Field locking by status:

| Status group | Behaviour |
| --- | --- |
| available … pod_received | Everything editable |
| accessorials_approved, ready_to_invoice | Financial fields editable with an inline warning that the load is about to be invoiced; non-financial fields silent |
| invoiced, factored, paid, settled, closed | Financial fields disabled with an explanation; owner can unlock with a typed reason (written to `audit_log`); non-financial fields stay editable for dispatcher, management, owner |
| any | Internal notes, driver-facing notes, special instructions always editable |
| any | `load_number` never editable |

Driver assignment renders read-only with a note pointing to the Load Detail page.

Any change to rate, charges, or anything else affecting total load value requires a brief typed reason before saving, with an optional file attachment stored as a `load_documents` row of type `broker_correspondence`. Non-financial edits require nothing.

## Change history on Load Detail

A new "Change History" section sits beside Status History, staff-only, gated exactly like internal notes. Each entry shows the field, old value, new value, who and when, and the reason where present. Financial changes get gold-accented styling to separate them from routine edits.

## Technical detail

Database:

- `load_change_history`: `id`, `load_id` (FK cascade), `field_path` text, `previous_value` text, `new_value` text, `is_financial` boolean, `reason` text, `changed_by` (profile), `changed_at`, `change_source` text. Index on `load_id`. GRANTs to `authenticated`/`service_role`, no `anon`. RLS: management/owner/dispatcher/onboarding staff read; inserts only through the definer function; operators no access.
- `update_load_with_stops(p_load_id, p_load jsonb, p_stops jsonb, p_charges jsonb, p_reason text, p_financial_unlock_reason text)` — SECURITY DEFINER, `search_path = public`, `REVOKE EXECUTE FROM public, anon`, `GRANT` to `authenticated`, profile references via `public.current_profile_id()`. It re-derives the load's current status and the caller's roles, rejects `load_number` changes, rejects financial field changes at locked statuses unless the caller is owner with an unlock reason, requires a reason when total load value changes, then reconciles stops (see below), reconciles `load_charges`, mirrors stop-off amounts back to `load_stops.stopoff_charge_amount`, recomputes `total_load_value`, and writes one `load_change_history` row per changed field — all in the single function call.
- Clearing a stop-off amount deletes the corresponding `load_charges` row rather than zeroing it.

Stop reconciliation (never replace):

- Submitted stops carry their existing `id` where they came from the loaded load. Matched stops are `UPDATE`d in place on form-owned columns only; genuinely new stops are inserted; only stops whose ids are absent from the submission are deleted.
- The update statement never touches driver-recorded columns: `actual_arrival_at`, `actual_departure_at`, the four latitude/longitude columns, and `facility_id` unless the dispatcher explicitly changed the facility link in the form. A phone-number edit on stop 2 leaves stop 1's 8:04 AM arrival and GPS untouched.
- Resequencing writes `stop_sequence` per the form's current order, and because rows are matched by id the recorded arrival/departure always travels with its own row — reordering renumbers the row, it does not shuffle timestamps between rows. Stop-off eligibility (middle stops only) is recomputed from the new sequence after matching.
- Deleting a stop that has any driver-recorded check-in data (`actual_arrival_at`, `actual_departure_at`, or coordinates) triggers a confirm dialog naming what will be lost, in the same spirit as the charge dialog; the server also rejects such a delete unless the client passes an explicit acknowledgement flag, and records the deletion in `load_change_history`.


Client:

- `src/lib/loadDetail.ts` gains `fetchLoadForEdit`, `updateLoadWithStops`, and `fetchLoadChangeHistory`, all through the existing context-preserving `rpc` helper, with `getDbErrorMessage` / `logDbError` on failure.
- Form refactor: mode-aware submit, hydration from an existing load, status-derived lock map, reason dialog, owner unlock dialog. shadcn components only, charcoal/gold styling.
- `LoadDetailPage` Edit button navigates to the edit route in both portals.

Tests:

- Extend `loadDetailOperatorAccess.test.tsx` so operators see no change history, reasons, or previous values.
- Wire the existing stop-off clearing unit test to the real edit save path.
- Cover the stop-removal-with-charge choice and the no-double-counting total.
- Pin driver-recorded data preservation: create a load, set `actual_arrival_at`, `actual_departure_at`, and coordinates on stop 1, edit an unrelated field on stop 2, save, and confirm stop 1's driver-recorded columns and `facility_id` are unchanged.
- Sibling case for reorder: with check-in data on stop 1, move stop 2 above it and save, then confirm the arrival timestamp is still attached to its own stop row and did not follow sequence 1.
