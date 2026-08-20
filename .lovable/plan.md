# Facility Matching on Parsed Rate Confirmations

Suggest-only matching of parsed stops against the existing facilities directory. Nothing is auto-substituted; the dispatcher sees both versions and chooses.

## Behavior

After a rate confirmation is parsed and the form is populated, each stop is compared against the active facilities directory.

- **Match found** — an inline suggestion appears on that stop card showing the two versions side by side:
  - "On the rate confirmation: J M Exotic Foods (a Midas Foods Comp"
  - "In our directory: J M Exotic Foods / Midas Foods — Moody, AL 35004" (illustrative only — no facility is seeded or created by this work)
  - Actions: **Use saved facility** (populates the stop from the directory record and sets `facility_id`, exactly as manual selection does today, so usage tracking increments) and **Keep as printed** (dismisses the suggestion, stop stays free text).
- **No match** — unchanged from today: parsed name lands as free text, no `facility_id`, the "Add new facility" path stays available.
- The suggestion never changes field values on its own, and it disappears once the dispatcher acts or edits the facility field.

## Matching rule

Address-first, name as tiebreak:

1. **Primary key** — normalized `address_line1` + exact `zip`. Normalization strips punctuation, hyphens and casing, and collapses whitespace, so `2435 US-78` and `2435 US 78` compare equal. Street-type and directional abbreviations are folded to a common form (`ST`/`STREET`, `N`/`NORTH`) so a stored "2103 S Main St" matches a parsed "2103 South Main Street".
2. **Tiebreak** — when more than one active facility shares that address (multi-tenant docks), the existing token-overlap `nameScore` from `rateConfirmation.ts` picks the best; if no candidate clears the threshold, all tied candidates are offered in the suggestion rather than one being guessed.
3. **No fallback on name alone.** A stop with no usable address produces no suggestion — a name-only match is too weak to put in front of a dispatcher as "this is your facility".

Truncated broker names never affect the match, since the name is only ever a tiebreak.

## Technical notes

- New `src/lib/facilityMatch.ts`: `normalizeAddressKey(address)`, `normalizeZipKey(zip)`, and `matchFacilities(stop, facilities): Facility[]` — pure functions, no I/O, unit-tested in `src/lib/__tests__/facilityMatch.test.ts` (hyphen/space variants, street-type and directional variants, multi-tenant address, truncated name, no-address case).
- Matching runs client-side against the already-cached `useFacilities()` list, so no new query and no edge-function change. `parse-rate-confirmation` is untouched.
- `applyParsedToForm` in `src/lib/rateConfirmation.ts` keeps writing free text and `facility_id: ''`. It additionally returns `facilitySuggestions: Record<stopIndex, Facility[]>` on `ApplyResult`; matching is deliberately kept out of the apply step's write path.
- `CreateLoadPage.tsx` holds the suggestions in state and passes them to `StopsSection`; accepting one reuses the existing `applyFacility` handler in `StopsSection.tsx`, so populated fields, `facility_id`, the "differs from the saved facility" note and `times_used` tracking all behave identically to manual selection.
- The suggestion card is rendered inside the existing stop card, above the facility field, using the muted/info styling already used for the "differs from saved facility" note.
- No schema change. `facilities`, `load_stops`, and `create_load_with_stops` are unchanged.

## Verification

- Re-parse the Cahaba document: the truncated "J M Exotic Foods (a Midas Foods Comp" stop surfaces a suggestion for the clean directory record, accepting it sets `facility_id` and fills the stop from our record, and a stop with no directory equivalent shows no suggestion and still saves as free text.
- **Negative case, same street different ZIP** — create a facility at the same street address as a parsed stop but with a different ZIP and confirm no suggestion appears. ZIP is an exact-match component of the primary key precisely so a same-street-different-town pair can never send a driver to the wrong place. Covered both by a unit test in `facilityMatch.test.ts` and by a live check.
- **No spurious drift note on accept** — after accepting a suggestion, the "differs from the saved facility" note must not appear, since the stop was just populated from that record. The existing `differs` comparison in `StopsSection` normalizes phone and whitespace on both sides, and accepting reuses the same `applyFacility` handler, so the values are identical; verified live rather than assumed.
