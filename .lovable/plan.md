## Add scroll bar to Pending Application Reviews

Match the pattern already used by the Pending Invite Acceptance card so the Pending Application Reviews list becomes independently scrollable instead of capped at the first 5 rows.

### Change
In `src/pages/management/ManagementPortal.tsx` (around line 1449), wrap the pending applications list with the same scroll container used in `PendingInviteAcceptance.tsx`:

- Replace `<div className="divide-y divide-border">` with `<div className="divide-y divide-border max-h-[420px] overflow-y-auto">`.
- Remove the `.slice(0, 5)` cap so all pending apps are reachable via scroll (the "View all" button still routes to the full Applications view).

### Out of scope
No changes to data fetching, sorting, styling of individual rows, or the Pending Invite Acceptance card.
