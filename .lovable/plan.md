# Fix: blank white screen on the Assignment Sheets tab

## What's happening

The search bar added last turn defines `matchesSearch` with a React `useCallback` at line 257 of `src/components/equipment/SignOffSheetList.tsx` — which sits *below* the `if (loading) return <spinner/>` early exit at line 240.

While the sheets are loading, that hook never runs. Once data arrives, it does. React sees a different number of hooks between renders, throws "Rendered more hooks than during the previous render", and unmounts the whole page — hence the blank white screen with no way back to the dashboard.

## The fix

In `src/components/equipment/SignOffSheetList.tsx`:

- Move the `matchesSearch` `useCallback` above the `if (loading)` early return so hook order is identical on every render.
- Leave the plain derived values (`counts`, `statusFilteredSheets`, `visibleSheets`, `TAB_DEFS`) where they are — they aren't hooks and don't affect hook order.

No other behavior changes; search, status tabs, and all card actions stay exactly as they are.

## Verification

Open Onboard Systems → Assignment Sheets in a headless browser and confirm the list renders with no page error, then type a query and confirm filtering still works.
