

## Hide deactivated applicants from the Applicant Pipeline

### Root cause

When you archive an applicant from the pipeline, the code correctly sets `operators.is_active = false` and removes that row from the page's local state. But the next time the pipeline loads, `fetchOperators` queries `operators` **without filtering on `is_active`**, so deactivated applicants come back.

I confirmed against the database: there are currently 7 deactivated operators (Laura Johnson, Davien Johnson, Christopher Jackson, Ivan Rodriguez, Tyrone Delee, Michael Scott, Salman Mohamed) — all of whom are still showing in the pipeline because of this missing filter. They also correctly appear under **Archived Drivers** (which already filters `is_active = false`).

### Fix

One-line change in `src/pages/staff/PipelineDashboard.tsx`, inside `fetchOperators` (around line 1009): add `.eq('is_active', true)` to the operators query so only active records load into the pipeline.

```ts
supabase.from('operators').select(`
  id, user_id, created_at, ...
`).eq('is_active', true)
```

Everything downstream (filters, search, sorting, stage chips, temperature, counts) automatically reflects the smaller set — no other code changes needed.

### What you'll see after the fix

- Reload the Applicant Pipeline → those 7 deactivated names disappear.
- They remain visible (and reactivatable) in **Archived Drivers**, exactly as before.
- Future "Archive applicant" actions will continue to remove the row immediately *and* keep them out on subsequent loads.

### Out of scope

- No schema changes.
- No change to the Archive flow itself — it already does the right thing on the write side.
- No change to Archived Drivers view — it already filters correctly.

