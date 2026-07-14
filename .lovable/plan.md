# Searchable driver picker — DOT Inspection Binder

## Problem
The "Select a driver to manage their binder…" control on the DOT Inspection Binder page (`src/components/inspection/InspectionBinderAdmin.tsx`, line ~1247) is a plain `<Select>` with drivers listed in load order — no search, no alphabetization, requires scrolling through the full roster.

## Change
Replace the main driver `<Select>` with a searchable combobox built from existing shadcn primitives (`Popover` + `Command` + `CommandInput` + `CommandList` + `CommandItem`), matching the pattern already used elsewhere in the app.

Behavior:
- Trigger looks like the current select (same height, border, dashed gold container above unchanged).
- Shows the selected driver's name (and unit number if available) once picked.
- Opening reveals a search box focused by default. Typing filters by **name** and **unit number** (case-insensitive, substring match).
- Options are sorted **alphabetically by last name, then first name**.
- Each row shows: driver name (primary) + unit number / "No unit" (muted, right-aligned) + a subtle "Inactive" tag when `is_active` is false.
- Keyboard: arrow keys navigate, Enter selects, Esc closes.
- Clear-selection affordance (small × in trigger) so staff can reset without picking a different driver.

Also apply the same searchable combobox to the two smaller driver pickers on the same page for consistency:
- "Share to specific driver…" per-company-doc row (~line 1088)
- "Select driver to assign…" in the staged-doc assign row (~line 1949)

## Out of scope
- No data model changes. `operators` fetch stays as-is.
- No changes to any other page's driver pickers.
- No new dependencies — `Command`/`Popover` already exist in `src/components/ui/`.

## Technical notes
- Extract a small local component (e.g. `DriverCombobox`) inside `InspectionBinderAdmin.tsx` (or a sibling file `src/components/inspection/DriverCombobox.tsx`) taking `{ operators, value, onChange, placeholder, includeInactive? }`.
- Sort helper: compare by `lastName || nameSplit[nameSplit.length-1]` then full name, using `localeCompare` with `{ sensitivity: 'base' }`.
- Preserve the existing `?driver=<userId>` deep-link behavior — the combobox is a controlled component bound to `selectedDriverId`.
- Keep the dashed gold "Choose a driver to begin" wrapper untouched.
