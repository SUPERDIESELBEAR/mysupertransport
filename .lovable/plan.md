## Status

Unconfirmed. The guard is in the migration and `P0032` is in `REJECTION_SQLSTATES`, but nothing in the repo records a wire observation and no fixture asserts it. Treat the code as derived until a real client returns it.

## Observe first, assert second

1. **Mint a real driver session** via the existing preview-session flow (`create-preview-session` → `redeem-preview-session`) for a demo driver. Not a service-role call — the guard must be exercised through the same client path a driver uses.
2. **Seed a scratch draft day** for that driver: a keyed `rods_days` row with a complete 12-field header and segments that sum to 1440, so the only failing condition is the name. If any other check fails first, the run reports that code instead and the observation is worthless.
3. **Call `certify_rods_day` with `certification_legal_name = 'Driver'`** through supabase-js and dump the whole `PostgrestError` verbatim — `code`, `message`, `details`, `hint`. Print the raw JSON, don't paraphrase.
4. **Repeat with `'Unknown'` and with `'   '`** (whitespace only). The third should surface the pre-existing empty-name code, not the placeholder one — that distinction is what proves the two guards are separate conditions rather than one guard being shadowed.
5. **Control run:** certify the same scratch day with a real name and confirm it succeeds, so the guard is shown to be the thing rejecting and not a broken row.
6. **Purge** the scratch day, its events, signature and PDF paths, and any ledger rows the certify attempt produced. Confirm zero rows remain for that driver.

## Then, and only then

- Write the fixture in `src/lib/eld/offline/__tests__/parityFixtures.test.ts` asserting the **recorded** code and message shape. If step 3 returns something other than `P0032`, the registry entry and `rodsValidation.ts`'s comment (which currently names P0032) both get corrected to the observed value — the wire wins, not the migration text.
- Record the observation in `docs/eld-pass-b-acceptance-2026-08-01.md`: date, driver, submitted name, and the verbatim error envelope, so the next audit reads evidence instead of prose.

## Technical notes

- Guard lives in `supabase/migrations/20260801230259_*.sql`, inside `certify_rods_day`, after the 12-field header check.
- Client registry: `src/lib/eld/offline/queue/types.ts:125`.
- Client-side mirror: `isPlaceholderLegalName` in `src/lib/eld/rodsValidation.ts` — its doc comment hardcodes `P0032` and must match whatever the wire returns.
- The certify path has two overloads; confirm the session's call resolves to the 8-arg variant the migration patched, or the observation is against the wrong function.
