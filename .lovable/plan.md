

## Enlarge Font Size on Fleet Roster Table Rows

### Change
Bump the font size on every table body cell from `text-xs` (12px) to `text-sm` (14px), and increase the header cells from `text-xs` to `text-xs` with slightly larger weight or also to `text-sm`. The DOT status badges will stay at `text-[10px]` since they're meant to be compact.

### File
| File | Lines | Change |
|------|-------|--------|
| `src/components/fleet/FleetRoster.tsx` | 206–213 | Change `TableHead` cells from `text-xs` → `text-sm` |
| `src/components/fleet/FleetRoster.tsx` | 223–243 | Change all `TableCell` cells from `text-xs` → `text-sm` |

This is a straightforward class name swap across 14 elements in one file.

