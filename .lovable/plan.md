## Onboarding Pipeline search — expanded fields

Broaden the pipeline search bar so staff can find operators by more than just name and phone. In addition to the current name + phone match, the search will also match:

- Email (application email)
- Truck VIN (partial, case-insensitive)
- Unit number
- Truck plate
- Home / address state (abbreviation or full)
- Assigned staff / coordinator name

### Changes

1. **`src/pages/staff/PipelineDashboard.tsx`**
   - Extend the operators query's `onboarding_status(...)` select to also pull `truck_vin`, `unit_number`, `truck_plate` (and use existing `applications.email`, already fetched, plus operator `unit_number` on the operators table itself).
   - Extend `OperatorRow` type + the row-mapping block to carry `truck_vin`, `unit_number`, `truck_plate`.
   - Replace the current `matchSearch` line:

     ```ts
     const matchSearch = name.includes(search.toLowerCase()) || (op.phone ?? '').includes(search);
     ```

     with a single normalized haystack match that lower-cases the query once and tests all searchable fields (name, email, phone, VIN, unit#, plate, home state, assigned staff name). Empty query short-circuits to true.

2. **Search input placeholder** (line ~2133) — update to something like:
   `Search name, email, phone, VIN, unit #, plate…`
   to signal the new capabilities to staff.

### Notes

- Purely client-side filter; no schema or RLS changes.
- Fields are already displayed on the operator card, so no new data-fetching cost of concern.
- Search stays case-insensitive and substring-based (matches how VIN lookups are typically done — paste last 6 of the VIN, etc.).