## Goal

In the Equipment menu, replace the four hover-only icon actions on each inventory row with compact, always-visible outline buttons that show both an icon and a label.

## Scope

Single file: `src/components/equipment/EquipmentInventory.tsx` (the `EquipmentRow` component, ~lines 397–431).

No business logic, modal, or data changes — handlers (`onHistory`, `onEdit`, `onAssign`, `onReturn`) stay wired exactly as today.

## Changes

1. Remove the `opacity-0 group-hover:opacity-100` wrapper so actions are always visible.
2. Replace each `<button>` with the shadcn `Button` component, `variant="outline"` and `size="sm"`, with icon + label:
   - History icon + "History" → `onHistory`
   - Pencil icon + "Edit" → `onEdit`
   - UserCheck icon + "Assign" → `onAssign` (still only when `status === 'available'`)
   - RotateCcw icon + "Return" → `onReturn` (still only when `status === 'assigned'`)
3. Keep the Assign and Return color accents (primary for Assign, status-complete for Return) via small `className` overrides so the visual hierarchy is preserved.
4. Tighten row padding/gap if needed so the new buttons fit cleanly on one line at the current viewport; the row layout itself is unchanged.

## Out of scope

- No changes to filters, modals, status badges, or row data.
- No changes to mobile-specific layout beyond what naturally follows from swapping the buttons in the same flex container.
