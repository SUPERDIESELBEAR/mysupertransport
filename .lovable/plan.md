# Stage Notes: Auto-Save + Reliable Persistence

## Today's behavior

Stage notes exist in Stage 1 (Background), Stage 2 (Documents), Stage 3 (ICA), Stage 4 (Missouri Registration), Stage 5 (exception notes + cost notes), and Stage 7 (Insurance). Stages 6, 8, and 9 have none.

All of them are stored on the shared `onboarding_status` record for the driver, so notes already are visible to every staff member who opens that driver — they are not per-user. The problem is saving: a stage note only lands in the database when someone clicks the single gold Save button in the sticky header. Leaving the page, closing the tab, or clicking away loses the text (a warning dialog appears, but it can be dismissed).

The bottom "Internal Notes" box already behaves the way you want: it saves itself 1.5 seconds after typing stops, shows a saved-at indicator, and has its own Save button.

## What will change

1. **Every stage note auto-saves on its own**, using the same pattern as Internal Notes: a debounced write ~1.5s after typing stops, writing only that one note field to the driver's record.
2. **Save on leaving.** Notes flush immediately when the note box loses focus, when the stage is collapsed, when the panel closes/unmounts, and on tab close/refresh — so nothing is lost by navigating away.
3. **Per-note status indicator.** Each note box gets a small "Saving… / Saved HH:MM / Retry" pill next to it, matching the Internal Notes pill, so staff can see the note is stored.
4. **Still fully editable by any staff member.** Notes remain a single shared text box per stage that anyone can edit; the newest save wins.
5. **No more false "unsaved changes" prompts for notes.** Note fields are excluded from the global dirty check once they auto-save, so the navigation warning only fires for other unsaved stage fields.

## Technical notes

- Add a reusable `useAutoSaveField` hook (mirroring the existing `saveNotesOnly` + debounce effect in `OperatorDetailPanel.tsx`) that writes a single `onboarding_status` column via `statusId` with `operator_id` fallback, with a loud error toast on failure.
- Wire it to `bg_check_notes`, `doc_notes`, `ica_notes`, `mo_notes`, `exception_notes`, `cost_notes`, `insurance_notes`; keep local `setStatus` for instant typing feedback.
- Flush pending writes via a ref-based `flushAll()` called from `onBlur`, component unmount, and a `beforeunload`/`visibilitychange` handler.
- Remove those seven fields from the `savedSnapshot` dirty comparison so the header pill and nav guard reflect only manually-saved fields.
- No schema change required — columns and RLS already exist and are shared across staff.

## Not included (say the word if you want them)

- Notes for Stages 6, 8, 9
- Author name / timestamp per note, or an append-only note history
