

## Hide Truck Down ribbon on the Applicant Pipeline page

The red **"X Operators Truck Down"** banner currently renders inside `StaffPortal.tsx` above the content slot, so it appears on **every** staff view (Dashboard, Pipeline, Drivers, Fleet, etc.). You want it gone specifically from the Pipeline page.

### Change

In `src/pages/staff/StaffPortal.tsx` (lines 514–539), wrap the existing banner condition so it also checks the active view:

```tsx
{truckDownOperators.length > 0 && currentView !== 'pipeline' && (
  <div className="mb-3 flex flex-wrap …">
    …
  </div>
)}
```

That's the only edit. Behavior afterwards:

- **Pipeline view** → banner hidden (the "Truck Down" status column + filter dropdown inside the pipeline table remain untouched, so dispatchers still see who's down).
- **All other staff views** (Dashboard, Drivers, Fleet, Equipment, etc.) → banner continues to show as before.
- The "View Pipeline" button on the banner still works from other views — once it navigates to Pipeline it just disappears, which is the desired behavior.

### Out of scope

- Not touching the Management portal's truck-down banner (`ManagementPortal.tsx`).
- Not touching the operator portal's personal truck-down alert.
- Not removing the ICA Drafts banner directly below it.

