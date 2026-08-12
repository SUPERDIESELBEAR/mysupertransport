# Status tabs for Assignment Sheets

Yes, that makes sense. The status pill on each card stays exactly as-is; a row of filter tabs is added above the list so sheets can be grouped by status.

## What will change
- A tab row appears under the "Assignment Sheets" heading: **All · Drafts · Sent · Signed · Void**.
- Each tab shows a count of matching sheets, e.g. "Drafts 3".
- Selecting a tab filters the cards below; "All" shows everything (current behavior) and is the default.
- Void is included so voided sheets stay reachable but out of the way of the active ones. Tabs with zero sheets still show, with a "No sheets in this view" empty state.
- The existing status pill, Refresh, Create Sheet, and all card actions are unchanged.

## Technical details
- `src/components/equipment/SignOffSheetList.tsx`: add a `statusFilter` state (`all | draft | sent | signed | void`), derive counts from the loaded `sheets` array, and render the tabs with the existing shadcn `Tabs`/`TabsList` styling used elsewhere on the Onboard Systems page so it matches the Inventory / By Driver / Assignment Sheets tab bar.
- Filtering is client-side over the already-fetched list — no query or schema changes.
- Status is read from `sheet.status ?? 'draft'`, matching the existing pill logic.
