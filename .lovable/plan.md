# Create TMS build handoff summary

Create `docs/tms-build-status.md` as a concise working reference for the current TMS build.

## Draft content

```markdown
# TMS Build Status — Handoff Summary

Date: 2026-08-22

## Built modules

| Module | Status |
|---|---|
| Loads list | List view with search, filters, and saved view preferences. |
| Create load | Full form with facility normalization, configurable load numbering, and broker/facility quick-add affordances. |
| Load detail — Pass 1 | Status transition engine and role-based access. |
| Load detail — Pass 2 | Driver assignment, documents section, and Photo Mode for inspections. |
| Load detail — Pass 3 | AI rate confirmation parsing integration (Gemini 1.5 Flash). |
| Load detail — Pass 4 | Tiered financial locking, audit history, and stop reconciliation. |
| Facilities | Directory with normalization; shared by stop picker and load form. |
| Brokers | Directory with factoring filters, search, orphan deletion, and in-place edit affordances. |
| Rate confirmation parsing | Extracts stops, charges, broker address, and reference numbers. |
| Load editing | `update_load_with_stops` RPC; financial change reason + classification required. |
| Revised rate con re-parse | Comparison review screen for revised documents. |
| Duplicate detection | Broker reference/MC duplicate warnings at parse and save time; overrides are audit-logged. |

## Key architectural decisions

- **`load_charges` is the authoritative charge record.** `stopoff_charge_amount` on `load_stops` is a display mirror used for quick rendering; write-time logic uses `load_charges`.
- **`current_profile_id()` resolves the actor's profile id.** All server-side TMS writers use it because `profiles.id` and `auth.uid()` are different values and every `created_by` / `updated_by` FK points to `profiles(id)`.
- **Financial changes require a reason and classification.** The form and RPC enforce this before accepting a save that alters what the broker is billed.
- **Stops reconcile by id.** Driver check-in data (arrival/departure, lat/long) is preserved across edits by matching existing stop ids rather than rebuilding the list.
- **Duplicate detection warns rather than blocks.** Duplicate broker reference/MC matches are surfaced as warnings; staff can override, and every override is written to the audit log.

## Test baselines

All test skips are visible and named; no silent `it.skip` or `test.skip`.

- **With database attached:** 514 passed, 2 skipped (67 files passed, 1 skipped).
- **Without database:** 495 passed, 13 skipped (64 files passed, 4 skipped).

## Open items

- **Unparsed rate confirmations:** Blue Grace revised, Rolling River, MegaCorp, and Nationwide still need parser coverage.
- **33 query sites in `src/components/inspection/` swallow errors; failures are not surfaced to the UI.
- **Broker address is not offered** when a parsed document contains an address but the linked broker record does not.
```

## Verification

- File created at `docs/tms-build-status.md`.
- Markdown renders correctly.
