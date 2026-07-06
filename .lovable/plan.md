## Change

In `src/components/equipment/EquipmentAssetSheet.tsx`, reduce the per-line **Delivery Method** selector to only two buttons:

- **Shipped to Driver**
- **Installed at Orientation**

Remove: *Installed On Site*, *Awaiting Return Shipment*, *Not Assigned*.

## Implementation

Edit the `DELIVERY_OPTIONS` array (currently ~lines 50–56) down to just the two kept entries:

```ts
const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: 'shipped',     label: 'Shipped to Driver' },
  { value: 'orientation', label: 'Installed at Orientation' },
];
```

No other code changes needed:

- `DeliveryMethod` union stays intact so any historical rows still deserialize cleanly.
- `DELIVERY_LABEL` is derived from `DELIVERY_OPTIONS`, so it auto-updates.
- The `anyAwaitingReturn` / return-shipment upload logic (line 260) keeps working for legacy data but no new value can be set to `awaiting_return` from the UI — acceptable per request.
- The `onDeliveryChange` handler's branches for `'not_assigned'`, `'awaiting_return'`, etc. become dead but harmless; leaving them avoids touching unrelated logic.

## Not changed

- Database schema, migrations, and the assignment **Status** dropdown (which already has its own "Not Assigned" option).
- Driver signature / lock behavior.
- Shipment receipt blocks.
