# Make the real diagnostics error visible

The panel now reports honest counts (4 collected, 0 recorded) but the reason is destroyed before it reaches the screen. `src/lib/parserDiagnostics.ts` line 171 uses `err instanceof Error ? err.message : String(err)`, and a PostgREST error is a plain object, so the message becomes `[object Object]`. Until that is fixed, naming the fourth cause is guesswork — so this plan makes the error visible first and fixes the cause second, in the same session, once the real `code` is on screen.

The project already has the right helper: `src/lib/dbError.ts` (`getDbErrorMessage`, `logDbError`). It is used on the load-detail surfaces but not on this write path.

## 1. Structured error extraction on the diagnostics write

- Extend `src/lib/dbError.ts` with `getDbErrorParts(err)` returning `{ message, code, details, hint }` — the shape-aware read, with fall-through to a real `Error`'s `message`, then `String(err)`. `getDbErrorMessage` keeps working and is expressed in terms of it.
- In `logParserDiagnostics`, replace the `instanceof Error` line with `getDbErrorParts`, and log the raw object with `logDbError` so the console keeps the untruncated shape.
- Widen `DiagnosticWriteResult.error` from `string | null` to the parts object (nullable), so callers get the code, not a flattened sentence.

## 2. Render every field in the panel

In the diagnostics block of `RateConfirmationParser.tsx`: show the code as the headline identifier (`Insert rejected — 42501`), then message, then details and hint as separate lines when present. Keep the persistent (non-dismissing-on-timeout) destructive toast, and include the code in the toast title so it is readable without opening the panel.

## 3. Name the cause, then fix it

With the code visible, classify before changing anything: `42501` means RLS/grant on the insert, `PGRST204` an unknown column, `23503` a foreign-key/actor-stamp problem, `23514` a check constraint, `22P02` a bad enum or uuid value. Fix only what the code identifies, and record the named cause in `docs/tms-build-status.md` alongside the previous three causes on this write path.

## 4. Codebase-wide audit of the same pattern

`err instanceof Error ? err.message : String(err)` appears 98 times. Every occurrence that can receive a Supabase client error produces `[object Object]`.

- Replace it with `getDbErrorMessage` / `getDbErrorParts` in client-side files where a `supabase.from(...)`, `.rpc(...)`, `.storage`, or `functions.invoke` result reaches the catch. That is the mutation modals and hooks (equipment, mo-plates, fleet, staff, ICA, drivers, application form, management portal, hooks like `useAutoSaveStatusField` and `useSignatureUrl`).
- Leave edge-function occurrences that only wrap `fetch`/JSON failures alone, and convert the ones that catch a Supabase admin-client call.
- Add an ESLint `no-restricted-syntax` rule banning the exact conditional so a new one cannot be introduced, with a message pointing at `getDbErrorMessage`.

## 5. Tests

- Unit test `getDbErrorParts` against a PostgREST-shaped plain object, a real `Error`, a string, and `null`.
- Test that `logParserDiagnostics` surfaces `code` on a rejected insert rather than `[object Object]`.
- Run the full suite and report results.

## Noted, not changed

Both appointment windows returned this run (Stop 1 08/17/2026, Stop 2 08/24/2026, each 12:00 AM–11:59 PM). The medium-confidence rule held; no change to that path.

## What I need

Send the console output with the real error object when you have it — if it arrives before section 3, the cause gets named from your run instead of a reproduction.
