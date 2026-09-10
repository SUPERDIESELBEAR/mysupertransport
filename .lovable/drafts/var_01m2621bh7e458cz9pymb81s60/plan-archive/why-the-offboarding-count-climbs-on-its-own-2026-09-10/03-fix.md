## The fix

Separate "a person did this" from "there was nothing to do here".

1. **Stop saving automatic decisions.** The offboarding screen keeps showing steps with no work as already handled — that part is useful and stays on screen — but it no longer writes them to the record just for being looked at. Only a step a person completes, or deliberately skips with a reason, gets saved.
2. **Save the automatic ones at the end.** When the run is actually finished, the whole picture is written as it is today, so a completed offboarding still records every step including the ones that had no work.
3. **Make the ribbon count honest.** The "X of 10 done" ribbon counts only real progress — steps a person completed or deliberately skipped. Opening the screen and backing out leaves the number exactly where it was.

Nothing changes about how offboarding actually works: the same steps, the same order, the same letters and documents.

## Technical notes

`src/components/management/DeactivationWizardContent.tsx`:

- `persistStep` gains an `auto` flag. The derive effect (lines 462-504) calls `updateStepStatus(..., { auto: true })`, which updates local state only — no upsert. All user-driven calls persist as they do now.
- The Finish handler (around line 816) already upserts the full step set, so auto-derived skips are recorded on genuine completion.
- Resume hydration is unchanged; auto statuses are recomputed on each open anyway.

`src/pages/staff/OperatorDetailPanel.tsx` (banner query, lines 710-722): unchanged in shape — it counts saved rows, which now only contain real progress.

Existing rows written by this behaviour stay as they are; they are not deleted. If you want the two stray rows on Willie (fuel card, plates) and the ones on Trovino cleared so the ribbon reads its true value, say so and I will remove exactly those and say which.

## Verification

Open a driver's offboarding, note the ribbon number, click Back without doing anything, and confirm the number is unchanged. Then complete one real step and confirm it goes up by exactly one.
