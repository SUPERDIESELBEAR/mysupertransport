

## Hide Truck Down ribbon on the Management Pipeline page too

The banner you're still seeing lives in **`ManagementPortal.tsx`** (the Management portal has its own copy, separate from StaffPortal). The Staff fix from last round is in place; Management was excluded as "out of scope" — but you're viewing the Management portal's Pipeline at `/dashboard?view=pipeline`, so you still see it.

### Change

In `src/pages/management/ManagementPortal.tsx` (line 756), add the same view guard:

```tsx
{truckDownCount > 0 && view !== 'pipeline' && (
  <div className="mb-5 flex flex-wrap … bg-destructive/10 …">
    …
  </div>
)}
```

### Result

- **Management → Pipeline** → banner hidden (Truck Down column + filter inside the table remain).
- **Management → Overview / Drivers / Fleet / etc.** → banner continues to show.
- **Staff portal** → already hidden on Pipeline from the previous change; unchanged here.

### Out of scope

- Operator portal's personal Truck Down alert.
- The "ICA Drafts in Progress" banner directly below it.

