# Pass report — 2026-09-14 23:09 UTC

## Scope

Documentation only. Edit `docs/tms-build-status.md`. No migration, schema change, test,
or application code.

## What was done

Added a new standing-rule section to `docs/tms-build-status.md`:

- Every Build-mode and Plan-mode pass must write its full report to a file in the
  repository as the final step, and commit it.
- Report path: `docs/passes/YYYY-MM-DD-HHMM-<short-name>.md`.
- One file per pass; never overwritten; never tidied.
- The file must contain the full report — verbatim errors, test counts, suite names,
  contradictions — exactly as it would have been written to chat.
- The reviewer verifies against the repository; the committed report is the claim.
- Two consequences recorded:
  1. A pass that cannot commit cannot deliver a report; committing is part of finishing.
  2. Plan-mode passes commit too, because the investigation is the deliverable.
- Reviewer must pull before reading; reading without pulling verifies against stale code.

## Verification

- `docs/tms-build-status.md` updated at lines 13301–13334.
- `git status --short` returned no working-tree changes after the edit (repository state
  is managed internally).
- No file outside `docs/` was modified.

## Contradictions

None.
