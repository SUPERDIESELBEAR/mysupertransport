

## Fix: Device & Truck Edit Fields Clearing While Typing

### Problem
The `TruckInfoCard` component has two `useEffect` hooks that re-sync `draft` and `truckDraft` state from props whenever `deviceInfo` or `truckInfo` changes. If the parent component re-renders (e.g., from a status poll, realtime subscription, or unrelated state change), new prop references are created, triggering these effects and overwriting whatever the user has typed — before they can click Save.

### Fix
Guard both `useEffect` hooks so they only re-sync when the corresponding edit popover is **closed**. When the popover is open, the user's in-progress draft should not be overwritten.

### Files changed

| File | Change |
|------|--------|
| `src/components/operator/TruckInfoCard.tsx` | Add `if (editOpen) return;` guard to the `deviceInfo` useEffect (line 102) and `if (truckEditOpen) return;` guard to the `truckInfo` useEffect (line 112) |

### Detail

```typescript
// Line 102 – device draft sync
useEffect(() => {
  if (editOpen) return;          // ← add this guard
  setDraft({ ... });
}, [deviceInfo]);

// Line 112 – truck draft sync
useEffect(() => {
  if (truckEditOpen) return;     // ← add this guard
  setTruckDraft({ ... });
  if (truckInfo?.trailer_number) setTrailerOpen(true);
}, [truckInfo]);
```

This is a one-line addition to each effect — no UI or layout changes.

