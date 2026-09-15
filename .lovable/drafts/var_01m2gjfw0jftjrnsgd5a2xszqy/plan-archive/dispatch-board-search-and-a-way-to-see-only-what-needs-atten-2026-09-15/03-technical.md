## Technical notes

Presentation only. One page file plus one pure helper module and its test.

**New helper** `src/lib/dispatchBoardFilters.ts`:
- `matchesBoardSearch(row: DriverChain, term: string): boolean` — normalises the term (lowercase, strip spaces/dashes for the load-number compare) and tests driver name, `unit_number`, and every load in `current` + `queued` + `paperworkTail` on `load_number` and origin/destination city/state.
- `boardAttentionFlags(row, activeClaimsByLoad, now): { claim, paperwork, noLoad, dueSoon }` — derived from data already in `BoardData`: `activeClaimsByLoad` keyed by load id, `row.paperworkTail.length`, `row.state === 'no_chain'`, and `ChainLoad.deliveryTime` compared against today in `CARRIER_TIMEZONE`.
- `filterBoardRows(rows, { term, flags, activeClaimsByLoad, now })` — AND of search and the OR of selected flags; applied after `filterRowsByDispatcher` so the dispatcher scope still wins.

**`src/pages/dispatch/DispatchBoardPage.tsx`**:
- Local `search` state fed through the existing `useDebouncedValue` hook; `Input` + `Search`/`X` icons styled like the Driver Status search field.
- Selected chips persist through the already-wired `useViewPreferences({ viewKey: 'dispatch_board' })` filters object alongside `dispatcher`, so a dispatcher's chosen focus survives navigation. Search text is not persisted.
- Chip counts computed over the dispatcher-scoped rows (`visibleRows` before attention filtering) so a count never promises rows the dispatcher cannot see.
- Both `visibleRows` and `visibleOffDispatchRows` run through the same filter, so the off-dispatch section stays consistent.
- Empty state gains a filtered variant with "Clear search" / "Clear filters".

**Tests** `src/lib/__tests__/dispatchBoardFilters.test.ts`: load-number match with and without the dash, city match on a queued load, unit-number match, `no_chain` flag, claim flag from the claim map, due-today boundary in carrier time, and chips-plus-search AND behaviour.

No changes to `assembleBoard`, `fetchBoard`, `loadClaims`, RLS, tables, or migrations.
