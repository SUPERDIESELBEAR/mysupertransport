# Fix stage content hidden behind the sticky stage title

## Problem

Each stage card in the Onboarding Pipeline driver panel has a sticky title bar (`Stage 1 — Background Check`) that pins under the sticky driver bar. When a stage is expanded, the panel auto-scrolls to that stage using a fixed 80px offset. That offset only accounts for the driver bar, not for the stage title bar that pins right below it, so the scroll lands roughly one title-bar too far down and the first section of the stage (MVR Status, Registration row, ICA status) ends up underneath the pinned title.

## Fix

1. Replace the hardcoded 80px scroll offset with a measured offset: the height of the sticky driver bar plus the height of that stage's sticky title bar, plus a small breathing gap. Both elements get refs/measurements at scroll time so the value stays correct as the bar's contents change (unsaved chip, stage dots, responsive wrapping).
2. Run the scroll after the expanded content has laid out (keep the double `requestAnimationFrame`, then re-check position once the smooth scroll settles) so a late layout shift can't leave the stage under the header.
3. Add top padding / `scroll-margin-top` to each expanded stage body so the first section never sits flush against the pinned title, including when the user scrolls manually rather than via the toggle.
4. Apply the same treatment to the "jump to stage" path (`scrollToStage`) so deep links and progress-dot clicks land consistently.

## Verification

Open a driver in the Onboarding Pipeline in a headless browser, expand Stages 1, 2 and 3 in turn, and screenshot each to confirm the first field of each stage is fully visible below the pinned title.

## Technical notes

- All changes are in `src/pages/staff/OperatorDetailPanel.tsx` (`scrollStageIntoView`, `toggleStage`, `scrollToStage`, and the per-stage header/body wrappers at the `sticky top-[52px]` buttons).
- Presentation/scroll behavior only — no data, completion-rule, or stage-logic changes.
