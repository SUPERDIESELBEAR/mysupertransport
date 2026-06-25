## Problem

PEI Queue's **Completed** and **GFE** filter chips are always empty, even when a previous employer has returned a completed PEI (e.g. Matthew Clovis). The completed response correctly shows on the applicant's record under Applications → PEI section, but it never appears in the PEI Queue's Completed tab.

## Root cause

The `get_pei_queue` Postgres RPC (called by `PEIQueuePanel`) hard-filters out finished requests:

```sql
WHERE pr.status NOT IN ('completed', 'gfe_documented')
```

So even though the UI exposes `Completed` and `GFE` filter chips and the client-side filter logic in `PEIQueuePanel.tsx` checks for those statuses, the data never reaches the client. Completed PEIs are only visible from inside the application drawer.

## Fix (single migration, no UI changes)

Update `public.get_pei_queue()` to return **all** PEI requests and let the existing client-side chips do the filtering they were already written to do:

- Remove the `WHERE pr.status NOT IN ('completed', 'gfe_documented')` clause.
- Keep signature, security, and ordering identical.
- Adjust ordering so completed/GFE rows sort to the bottom (null deadline last, then by `created_at`) — preserves current "what needs action first" ordering for the default **All** view.

## Why no UI changes

`PEIQueuePanel.tsx` already:
- Renders `Completed` and `GFE` filter chips.
- Has matching filter branches (`r.status === 'completed'`, `r.status === 'gfe_documented'`).
- Has `STATUS_ORDER` entries for both completed states in the group summary.
- Stats tiles (`Total Open`, `Awaiting`, `Follow-Up`, `Overdue`) are computed from row predicates, not row count alone, so they stay accurate once completed rows are included.

The only visible behavior change: **All** view will now also list completed rows below open ones, and the **Completed** / **GFE** chips will finally show data.

## Verification

1. As management, open PEI Queue → **Completed** tab → Matthew Clovis's completed employer response should now appear.
2. **All** tab → completed rows appear below pending/sent rows.
3. Stat tiles (`Total Open`, `Awaiting Response`, `Follow-Up Needed`, `Overdue / GFE`) remain unchanged in value.
4. Opening a completed row's **Open** action still routes to the application's PEI tab.

## Out of scope

- No change to the applicant-side PEI tab (already working).
- No change to email tracking, GFE flow, or queue ordering semantics for open items.
