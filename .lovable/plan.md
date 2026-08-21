# Pass 3 — Duplicate broker reference detection

Warn, never block. Detection runs only on the Create Load form: at parse time and again at save time. The edit form and the revised rate confirmation flow are untouched.

## Answer to the question asked first: carrying the file across

I propose an in-memory handoff, not a re-upload, and it is not fragile — but it is deliberately fail-safe.

Both portals route client-side (React Router), so the `File` object stays alive across the navigation from Create Load to Load Detail as long as the page is not hard-reloaded. A tiny module singleton `src/lib/rateConHandoff.ts` holds `{ file, parsed, targetLoadId, createdAt }`. Create Load stashes it, navigates to the existing load, and `LoadDetailPage` consumes it once on mount when the stashed `targetLoadId` matches — opening `RevisedRateConModal` already primed with the file and the existing parse result, so no second parse call either.

Rules that keep it safe:

- Consumed exactly once, then cleared. No stale reuse.
- Ignored if older than 5 minutes, or if the load id does not match.
- If it is empty (hard reload, deep link, browser restore) the modal simply opens on its normal upload step and the dispatcher picks the file. Nothing errors and nothing is silently half-filled.

So: file survives the normal path; on the abnormal path it degrades to the plain re-upload we would have accepted anyway. No storage write, no URL payload, no serialization of a File.

## Matching rules

Candidates are loads with a non-empty `broker_reference_number` equal to the entered/parsed reference (case- and whitespace-insensitive, trimmed) and `status <> 'cancelled'`.

- **Confident match:** same `broker_id` and same reference.
- **Lower-confidence match:** the new load has a reference but no `broker_id` yet (parsed, broker not confirmed). Match the extracted broker *name* against `brokers` (the existing normalized-name comparison used by broker matching), then look for loads under those broker ids. Worded as "may already exist" rather than "already exists".
- Reference alone, with a different broker, never matches.

## Where it fires

1. **Parse time** — as soon as `parse-rate-confirmation` returns a broker reference, before the dispatcher touches anything else.
2. **Save time** — re-run on submit, since the reference may have been typed or edited after the parse. If a match appears here, save pauses and the same dialog appears.

## The warning dialog

Shows each matching load: load number, status badge, created date, created-by name, and a one-line origin → destination with stop count. Three actions:

- **View existing load** — navigates to that load's detail page. Routed through the existing `useUnsavedChanges` guard so the unsaved-changes dialog fires first.
- **Update existing load instead** — stashes the handoff and navigates to that load with the revised rate confirmation modal open and the file/parse carried over (see above).
- **Create anyway** — requires a short reason (free text, required), then proceeds with the normal save.

## Recording the override

On a "create anyway" save, after the load is created, write **two** `load_change_history` rows for the same event — one on each load — so the relationship is visible from whichever load someone opens first.

- On the **new** load: it was created despite an existing load for the same broker reference, naming the original load's number and id, with the reason.
- On the **original** load: a duplicate was created against its broker reference, naming the new load's number and id, with the same reason.

Same event, worded from each load's own perspective. No new table and no schema change — the existing history shape carries the counterpart load id and number in its value fields, so both entries render in the existing Change History card. Writing the original's entry must not fail the save: if it errors, the new load and its own entry stand and the failure is surfaced as a non-blocking notice.


## Tests

In a new `src/lib/__tests__/duplicateBrokerRef.test.ts`, against the pure matcher:

- same broker + same reference → warning
- same reference + different broker → no warning
- match against a `cancelled` load → no warning
- unlinked broker: reference with no `broker_id`, extracted broker name matching an existing record → warning, flagged lower confidence
- create-anyway → override entry carries the reason and the duplicated load id

## Technical notes

- New `src/lib/duplicateBrokerRef.ts`: reference normalization, the query builder, the pure classifier (`confident | probable | none`), and the override-history payload builder. Kept pure so tests need no network.
- New `src/components/dispatch/loadForm/DuplicateBrokerRefDialog.tsx`: the match list + three actions + reason field.
- New `src/lib/rateConHandoff.ts`: the one-shot in-memory stash described above.
- `CreateLoadPage.tsx`: calls the check after parse and inside the submit path before `performSave`; unchanged save payload logic.
- `LoadDetailPage.tsx`: consumes the handoff on mount and opens `RevisedRateConModal` primed; `RevisedRateConModal` gains optional `initialFile` / `initialParsed` props and skips its upload step when they are present.
- No migration. No uniqueness constraint.
