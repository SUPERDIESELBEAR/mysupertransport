## What this pass changes

1. **Plain message instead of database wording.** When the list is not switched on
   yet, the picker says: "The available-number list turns on when this draft is
   accepted. You can type the unit number in the meantime." Typing by hand keeps
   working, so onboarding is never blocked.
2. **Same wording everywhere.** The Vehicle Hub panel already says something
   similar; both will read from one shared sentence so they cannot drift.
3. **Correct the staged list order at the source.** The staged database function
   currently returns the three groups in alphabetical order, and the app re-sorts
   them into recycled → gaps → next. That fix moves into the function itself, so
   any future reader gets the right order without knowing the rule.

## Technical notes

- `src/lib/unitNumberPool.ts`: export `POOL_UNAVAILABLE_MESSAGE` and a
  `isPoolMissing(error)` helper matching the missing-function error (`PGRST202`
  or a message naming `unit_number_pool` / `unit_number_holders`).
- `src/components/operator/UnitNumberPicker.tsx`: use the helper in the pool
  `catch`; render the message as muted text, not as an error. Holder lookups
  already fail silently, so no change there.
- `src/components/fleet/UnitNumberPoolPanel.tsx`: swap its inline regex check for
  the shared helper and message.
- Staged migration `.lovable/drafts/.../migrations/20260914153000_unit_number_pool.sql`:
  replace `ORDER BY 2` with an explicit rank (`recycled` 0, `gap` 1, `next` 2),
  then `freed_at NULLS LAST`, then `unit`. Also review the holder aggregation for
  a number held by more than one operator so a post-Go-Live holder always wins
  over a released one. Still additive; applies only on accept.
- Tests: extend `src/lib/__tests__/unitNumberPool.test.ts` for `isPoolMissing`
  (missing-function error true, permission error false).

Nothing here can be exercised against live data until the draft is accepted;
the message path and the helper tests can be verified now.
