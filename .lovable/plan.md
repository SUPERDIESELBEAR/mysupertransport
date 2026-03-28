

## Add Email Column to Driver Hub Roster

### Approach
Add a truncated email column between Phone and State with a one-click copy button. Hidden on mobile for clean responsive behavior.

### Changes

**1. `src/components/drivers/DriverRoster.tsx`**
- Add `email: string | null` to the `DriverRow` interface
- Fetch email from the `profiles` join (it's already joined for avatar — add `email` to the select)
- Add a new `<TableHead>` for "Email" between Phone and State, with class `hidden lg:table-cell`
- Add a new `<TableCell>` with:
  - `max-w-[180px] truncate` for the email text
  - Tooltip showing the full email on hover
  - A small `Copy` (clipboard) icon button that copies to clipboard with a toast confirmation
  - Class `hidden lg:table-cell` to hide on smaller screens

### Files changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | Add email to interface, fetch, column header, and cell with truncation + copy |

