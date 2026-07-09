## Fuel Card summary + scrollable sections

**File:** `src/components/equipment/EquipmentInventory.tsx`

### 1. Add "Deactivated" to the summary row
In the Fuel Card group header (currently shows `Available · Assigned · Lost` and hides Deactivated when zero), always render a `Deactivated` count pill after `Lost`, styled like the others (muted color). Applies to all device types for consistency.

### 2. Make each subsection scrollable (Assigned, Unassigned Inventory, Deactivated)
Today the parent card slices to the first 8 items before splitting into subsections, so only ~7 assigned cards show even when 60 exist.

Change for the `fuel_card` type only:
- Pass the full filtered `typeItems` (not the 8-item slice) into `FuelCardSections`, and drop the "Show more/less" toggle for fuel cards since scroll replaces it.
- In `FuelCardSections`, wrap each section's grid/list in a scroll container with `max-h-[560px] overflow-y-auto` and a subtle inner padding so the header stays anchored above.
- When a status pill (Available / Assigned / Lost / Deactivated) is active, only the matching section will have items — the scroll container still applies so long lists (e.g. all 60 assigned) become fully browsable.

### 3. Section mapping refresh
Update the section split so pills line up with subsections:
- Assigned → `assigned`
- Available → `available` (subtitle: "Available fuel cards not yet assigned to a driver")
- Lost → `lost` (new subsection, only rendered when the Lost pill is selected or when count > 0 under All)
- Deactivated → `deactivated`

Under the "All" filter, show Assigned + Available (Unassigned Inventory) + Deactivated as today, plus Lost only when count > 0. Under a specific pill filter, only the matching subsection appears.

### Out of scope
No changes to data model, modals, or non-fuel-card device types beyond the header pill.
