# Fix the State dropdown being covered by the Cancel button (PEI edit row)

## Problem
In the PEI tab's inline "edit contact" row, the fields are laid out on a 12-column grid: Email (5), City (4), State (2), and the Cancel/Save buttons (1). One column is far too narrow for two buttons, so they spill left and sit on top of the State select. The X ends up capturing the clicks that should open the state list.

## Fix
Rework the edit row layout so the buttons never overlap a field:

- Give State more room (3 columns) and move the Cancel/Save buttons onto their own full-width line, right-aligned, below the fields.
- Keep the same behavior for both buttons — only placement changes.
- Ensure the select keeps full width and normal height so the whole control is clickable.

## Technical detail
File: `src/components/pei/ApplicationPEITab.tsx`, the `isEditing` block (grid starting around line 427).
- Email `sm:col-span-5` → `sm:col-span-5`, City `sm:col-span-4`, State `sm:col-span-3`.
- Change the actions wrapper from `sm:col-span-1` to `sm:col-span-12 flex justify-end gap-2 pt-1`.

No data, RLS, or business-logic changes.
