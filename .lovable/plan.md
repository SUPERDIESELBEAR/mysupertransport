

## Fix: Truck Info Save Not Updating Snapshot

### Problem
When you save truck info or device numbers via the TruckInfoCard, the handlers (`handleTruckDeviceEdit` and `handleTruckInfoEdit`) correctly persist to the database and update local `status` state, but they **do not** update `savedSnapshot.current`. The unsaved-changes guard compares `status` against `savedSnapshot`, sees they differ, and falsely warns about unsaved changes on exit.

### Fix
After each successful save in both handlers, synchronize `savedSnapshot.current.status` with the newly updated fields so the comparison stays clean.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | In `handleTruckDeviceEdit` (~line 1618): after `setStatus(...)`, update `savedSnapshot.current.status` with the same device fields. In `handleTruckInfoEdit` (~line 1652): after `setIcaTruckInfo(...)`, update `savedSnapshot.current.status` with the same truck fields. |

### Detail

In `handleTruckDeviceEdit`, after the `setStatus` call, add:
```typescript
if (savedSnapshot.current) {
  savedSnapshot.current = {
    ...savedSnapshot.current,
    status: { ...savedSnapshot.current.status, ...payload },
  };
}
```

Same pattern in `handleTruckInfoEdit`, after `setIcaTruckInfo`:
```typescript
if (savedSnapshot.current) {
  savedSnapshot.current = {
    ...savedSnapshot.current,
    status: { ...savedSnapshot.current.status, ...truckFields },
  };
}
```

This is a two-line addition to each handler -- no UI or layout changes.

