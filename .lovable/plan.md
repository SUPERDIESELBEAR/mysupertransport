## Goal

Show plate history directly on the MO Plate Registry cards (and table rows) so staff don't have to open the History modal for routine checks. Applies to all tabs: All, Available, Assigned, Lost/Stolen, Retired.

## What it will look like

Each plate card gets a "Recent activity" section above the action buttons:

```text
Recent activity
● Assigned — J. Smith (Unit 1900) · Mar 4, 2026
● Returned — K. Lopez (Unit 1421) · Jan 12, 2026
                                    Show all (7)
```

- Always shows the two most recent events, newest first.
- Colored dot per event type, matching the existing History modal palette: assignment = primary, lost/stolen = destructive, replacement received = green.
- Each line is a compact one-liner: event label — driver name (Unit #) · date. Return events render as "Returned — <driver>" using the returned_at date.
- "Show all (N)" expands the full history inline for that plate; it becomes "Show less" when open. Long lists scroll within the card.
- If a plate has no history: a single muted line "No activity yet."
- The existing "History" button stays as-is for the full modal view.

Table view: each row gets a chevron in the leftmost cell. Clicking expands a sub-row with the same two-event timeline and the same "Show all" behavior. Rows stay collapsed by default.

## Technical approach

Single file change plus one small shared component.

1. **Batch fetch history in `MoPlateRegistry.tsx`.** `fetchPlates` already queries `mo_plate_assignments` for open assignments only. Add a second query pulling all rows for the visible plate IDs (`id, plate_id, driver_name, unit_number, event_type, assigned_at, returned_at, notes`), ordered by `assigned_at` descending. Group them into a `Record<plateId, Assignment[]>` in state. This keeps it to one extra round trip for the whole page — no per-card requests.

2. **New `MoPlateHistoryStrip.tsx`** in `src/components/mo-plates/`. Props: `events: Assignment[]`, optional `className`. Owns its own `expanded` boolean, renders the two-event preview, the expand toggle, and the empty state. Event label/dot config is extracted from the existing `EVENT_CONFIG` in `MoPlateHistoryModal.tsx` into a shared const so both stay in sync.

3. **Card view**: render `<MoPlateHistoryStrip>` between the notes line and the actions row.

4. **Table view**: add an `expandedRows: Set<string>` state, a chevron button cell, and a conditional `<TableRow>` containing a full-width `<TableCell colSpan>` with the strip.

5. Refresh: history state is repopulated by the existing `fetchPlates()` call, which every mutation handler already invokes, so assign/return/lost/retire actions update the strip automatically.

No database or RLS changes — `mo_plate_assignments` is already read by this page under the same policies.
