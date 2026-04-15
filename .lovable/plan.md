

## Normalize Serial Numbers: Strip Dashes & Spaces

### Problem
A serial number entered as `ABC-123` and `ABC123` (or `ABC 123`) are treated as different devices by both the UI duplicate check and the database unique index. This allows accidental duplicates.

### Solution
Normalize serial numbers by stripping all dashes, spaces, and dots before comparison and storage. This affects three locations:

### Changes

**1. `src/components/equipment/EquipmentItemModal.tsx`**
- Update the `normalizedSerial` line to strip non-alphanumeric characters: `serialNumber.trim().replace(/[-.\s]/g, '').toUpperCase()`
- Store the normalized value in the database (not the raw input)

**2. `src/lib/equipmentSync.ts`**
- Apply the same normalization to the `serial` variable before querying or inserting: `.trim().replace(/[-.\s]/g, '').toUpperCase()`

**3. Database migration**
- Drop and recreate the unique index to use the stripped form:
```sql
DROP INDEX IF EXISTS idx_equipment_items_serial_type;
CREATE UNIQUE INDEX idx_equipment_items_serial_type
  ON public.equipment_items (
    upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', '')),
    device_type
  );
```
- Update any existing rows to normalize stored serial numbers:
```sql
UPDATE public.equipment_items
SET serial_number = upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', ''))
WHERE serial_number <> upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', ''));
```

### Result
Whether a user types `ABC-123`, `ABC 123`, or `ABC123`, the system will store `ABC123` and correctly detect duplicates across the board.

