

## Replace Truck Make Free-Text with Dropdown & Remove Model Field

This is the same plan previously approved, confirmed with model removal.

### Shared Constant
Define `TRUCK_MAKES` in `src/components/operator/TruckInfoCard.tsx` (exported):
```typescript
export const TRUCK_MAKES = [
  'Freightliner', 'Kenworth', 'Peterbilt', 'Volvo',
  'Mack', 'International', 'Western Star',
] as const;
```

### Changes

**1. `src/components/operator/TruckInfoCard.tsx`**
- Remove `truck_model` from interfaces and edit/display logic
- Replace Make `<Input>` with `<Select>` dropdown + "Other" free-text fallback
- Update display string to `[truck_year, truck_make]`

**2. `src/components/drivers/AddDriverModal.tsx`**
- Remove `truck_model` from form state and ICA insert
- Replace Make input with Select dropdown + "Other"
- Change truck row from 3-col to 2-col grid

**3. `src/components/ica/ICABuilderModal.tsx`**
- Remove `truck_model` from ICAData interface, state, and pre-fill
- Replace Make field with Select + "Other"
- Remove Model FormField

**4. `src/components/ica/ICADocumentView.tsx`**
- Remove `truck_model` from ICAData, update `fullTruck` concatenation

**5. `src/components/fleet/FleetRoster.tsx`**
- Remove `truck_model` from queries and display

**6. `src/pages/staff/OperatorDetailPanel.tsx`**
- Remove `truck_model` from queries, merged state, stripped columns, save payloads

**7. `src/pages/operator/OperatorPortal.tsx`**
- Remove `truck_model` from ICA truck info query/state

**8. `src/components/operator/OperatorICASign.tsx`**
- Remove `truck_model` from ICAData and audit metadata

**9. `src/components/management/FormsCatalog.tsx`**
- Remove `truck_model` from sample ICA data

**10. `supabase/functions/send-insurance-request/index.ts`**
- Remove `truck_model` from query and email body

### "Other" Handling
Each Make dropdown includes an "Other" option. When selected, a text input appears. The stored value is the typed text, not "Other".

### No Database Migration
The `truck_model` column stays in the database — we simply stop reading/writing it.

