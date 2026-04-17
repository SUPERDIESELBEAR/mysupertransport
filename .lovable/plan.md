

## Truck Specs Sync — Final Plan (with Fleet Roster inline edit)

### What I'm building
Centralize all truck spec writes through one helper so staff never re-type VIN/plate/make/model/year/trailer across the app. Plus add a quick-edit pencil on Fleet Roster rows.

### The Helper
**`src/lib/truckSync.ts`** — `saveTruckSpecs(operatorId, statusId, payload, actorId)`
- Updates `onboarding_status` (always)
- Mirrors to `ica_contracts` only where `status IN ('draft','sent_to_operator')` — never touches signed contracts
- Normalizes VIN (uppercase, trim, strip dashes/spaces)
- Skips empty values (coalesce semantics — half-filled forms can't blank existing data)
- Logs one `audit_log` entry per save with the diff in `metadata`

### Entry Points Wired to Helper

| File | Change |
|---|---|
| `src/lib/truckSync.ts` *(new)* | The shared save helper |
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace inline dual-update in `handleTruckInfoEdit` with helper call |
| `src/components/fleet/FleetDetailDrawer.tsx` | Switch save handler to helper (gains automatic ICA sync) |
| `src/components/drivers/AddDriverModal.tsx` | Submit also writes truck specs to `onboarding_status` via helper |
| `src/components/ica/ICABuilderModal.tsx` | On "Send to Operator", mirror truck spec edits back through helper |
| `src/components/fleet/FleetRoster.tsx` | Add quick-edit pencil per row → opens compact modal → helper |
| `src/components/fleet/QuickTruckEditModal.tsx` *(new)* | Small modal: year/make/model/VIN/plate/state/trailer — uses helper |

### Read Side
No changes — Fleet Roster, Operator Portal, and Operator Detail Panel already merge `onboarding_status → ica_contracts` correctly.

### Guardrails
1. Signed ICA contracts are immutable — helper never updates them
2. VIN normalization prevents duplicate-looking trucks
3. `coalesce(new, old)` — empty fields never wipe existing data
4. Single audit log entry per save with before/after diff
5. No DB migration — reuses existing columns, zero schema risk

### Out of Scope
- Operator-facing edits (operators stay read-only on truck specs)
- Backfilling existing mismatches between the two tables (one-time cleanup if you want it later)

