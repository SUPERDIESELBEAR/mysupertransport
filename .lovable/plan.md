# Create a facility from a stop on Create Load

## What I found

**Item 1 — "Add new facility" was built, never regressed, but is unreachable in the state you hit.**

`FacilitySelect.tsx` does render an "Add new facility" item. The problem is that the dropdown is a `Command` with `shouldFilter` enabled, and that item's search value is the literal string `__add__`. cmdk filters every item against the typed text, so as soon as the dispatcher types a facility name, `__add__` no longer matches and the item is filtered out of the DOM — leaving only the "No saved facility matches" empty state with no action. The same applies to the "Unlink saved facility" item. It only appears when the input is empty, which is exactly the state a dispatcher is never in when they need it. So: built, but effectively dead code under typing.

**Item 2 — the inline "not saved" affordance on a parsed stop was never built.**

`StopsSection.tsx` renders a suggestion card only when `facilitySuggestions[index]` has directory matches. When there is no match, the stop shows nothing at all — no indicator that the facility is unsaved and no way to add it. Nothing was removed; this path was never implemented.

## Fix

### 1. Make the add action always reachable in the combobox

- Keep `shouldFilter` for the saved-facility list, but make the action rows immune to filtering: render "Add new facility" and "Unlink saved facility" with `forceMount` so cmdk keeps them regardless of the query, and give the add row a search value that includes the typed text so it never disappears.
- Move the add row above the saved list so it is visible whether or not there are matches, and label it with the typed name when there is one: `Add "J M Exotic Foods" as a new facility`.
- Replace the passive `CommandEmpty` text with the same actionable wording, so the no-match state always carries an action.

### 2. Inline "not saved" indicator on the stop card

In `StopsSection.tsx`, when a stop has no `facility_id`, no directory suggestion, and a non-empty facility name, show a compact inline note under the facility field in the muted/info style already used by the suggestion card:

- "This facility isn't in your directory."
- Action: **Save to facilities** — opens `FacilityDialog` prefilled from the stop's *current* field values (facility name, address 1/2, city, state, zip, contact name, contact phone), so a corrected truncated name is what gets saved.
- Dismissible for that stop, same as the existing suggestion card.

On save, the new facility is applied to the stop through the existing `applyFacility` handler, so `facility_id` is set and the fields are repopulated from the saved record — identical to picking one manually. Because the dialog was prefilled from those same fields, the "differs from the saved facility" note will not appear.

### 3. Parity with the Facilities page

Both paths reuse `FacilityDialog` unchanged, which is the same component the Facilities page uses — same insert, same validation, same `created_by` trigger stamping. Usage tracking is unchanged: `facility_id` on the stop flows into `create_load_with_stops`, which increments `times_used` / `last_used_at` on save. No new write path is introduced.

## Technical notes

- Files touched: `src/components/dispatch/loadForm/FacilitySelect.tsx` (forceMount action rows, actionable empty state, add-row label), `src/components/dispatch/loadForm/StopsSection.tsx` (unsaved-facility note + dialog wiring).
- No schema change, no RPC change, no edge-function change. `FacilityDialog.tsx` and `facilityMatch.ts` are unchanged.
- New unit test is not the right tool here (cmdk filtering is render-level); verification is a live browser check on Create Load: type a name with no match and confirm the add action is present; create from it and confirm the stop links, no drift note appears, and the facility shows up in the directory.
