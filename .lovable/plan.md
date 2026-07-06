## Change
Show a **single pill per equipment row on the driver view**, and backfill legacy `not_assigned` delivery values.

## Frontend (`src/components/equipment/EquipmentAssetSheet.tsx`)
In `EquipmentLineRow` header (lines 521–530), replace the two-badge block with mode-aware rendering:

- **`mode === 'driver'`**: render exactly one badge.
  - If `deliveryMethod` is set and not `'not_assigned'` → show `DELIVERY_LABEL[deliveryMethod]` with the neutral badge style.
  - Else → show the Status pill (`STATE_LABELS[state]` + `STATE_BADGE[state]`).
- **`mode === 'management'`**: keep both pills exactly as today (Status + Delivery Method when set), so editors keep full context.

No other component logic changes.

## Backfill migration
One-time cleanup so the legacy literal "Not Assigned" delivery values stop rendering:

```sql
UPDATE public.onboarding_status
SET
  eld_delivery_method       = NULL WHERE eld_delivery_method       = 'not_assigned';
-- repeated for: dash_cam_delivery_method, bestpass_delivery_method,
-- fuel_card_delivery_method, decal_delivery_method
```

(Executed as a single migration touching all five columns.)

## Not changed
- `DeliveryMethod` union or `DELIVERY_OPTIONS` (already trimmed to Shipped / Orientation).
- Management editor controls, receipts blocks, signature flow, or RLS.
- Assignment `Status` dropdown values.
