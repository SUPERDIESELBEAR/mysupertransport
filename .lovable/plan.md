

## Add Dispatcher Name to Cards and Sort by Dispatcher

### What's Changing

1. **Dispatcher name label at the top of each card** — Display the assigned dispatcher's name in the card header strip (below the status badge area). Shows as a small muted label like "Dispatcher: John Smith" or "Unassigned" if none.

2. **Sort cards by dispatcher** — When viewing "All Drivers", group/sort cards alphabetically by dispatcher name so all of one dispatcher's drivers appear together. Unassigned drivers sort to the end. Within each dispatcher group, maintain the existing sort order (name/unit).

### Technical Details

| Area | Change |
|------|--------|
| `src/pages/dispatch/DispatchPortal.tsx` — Card header (line ~1074) | Add a small dispatcher name line using `dispatcherNames[row.assigned_dispatcher]` below the status strip, styled as `text-[11px] text-muted-foreground` |
| `src/pages/dispatch/DispatchPortal.tsx` — `filteredRows` memo (line ~613) | After filtering, sort results by dispatcher name (alphabetically), with unassigned rows last. Secondary sort by driver last name. |

### Behavior

- Each card shows the dispatcher's first+last name in the header area
- If no dispatcher is assigned, it shows "Unassigned" in italic
- Cards are sorted so all drivers for the same dispatcher are grouped together
- The dispatcher name map (`dispatcherNames`) is already fetched — no new queries needed

