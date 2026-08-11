# Stages 2–5: first row still hidden under the pinned stage title

## What's happening

Each stage card's title bar pins under the sticky driver bar, and expanding a stage runs a scroll helper that offsets by driver-bar height + that stage's title-bar height + 12px. That math was added last round, yet Stage 4 still lands with its first row (the orange "…submitting." notice) sliced in half behind the pinned title — so the offset in use at scroll time is not the offset that ends up applying.

Rather than guess at another constant, this fix starts by measuring the real numbers in the running app.

## Plan

1. Reproduce and measure. Open the Onboarding Pipeline driver panel in a headless browser at the reported width, expand Stages 2, 3, 4 and 5 one at a time, and log for each: driver-bar height, stage title-bar height, the scroll target computed, the actual resting scroll position, and the gap between the pinned title's bottom edge and the top of the stage's first body element. Screenshot each stage. This identifies whether the landing position is wrong, the settle re-check is being defeated by late layout (banners, images, async status loads), or the correct scroll simply drifts afterwards.

2. Fix the landing position based on that measurement. Expected shape of the fix:
   - Scroll against the stage's first body element (not the card wrapper), using `scroll-margin-top` set to driver bar + title bar + gap, so the browser itself enforces the clearance and the value survives layout shifts.
   - Replace the single 400ms re-check with a settle loop (re-measure on `scrollend`, with a short polling fallback) that corrects until the first body element sits fully below the pinned title.

3. Keep the sticky title readable. Ensure the pinned title bar stays fully opaque with its bottom border so any content that later scrolls under it reads as scrolled-away content, not a clipped field.

4. Apply uniformly to all stage cards (1–7 plus the PE stage) so no stage behaves differently, and to the "jump to stage" path used by the progress dots.

5. Verify by re-running step 1's measurement script: every stage must show its first row and its section label fully below the pinned title, at the current 731px viewport and at desktop width.

## Technical notes

- All changes in `src/pages/staff/OperatorDetailPanel.tsx`: `scrollStageIntoView`, `toggleStage`, `scrollToStage`, the per-stage sticky title buttons (`top: stickyBarHeight`) and the expanded body wrappers.
- Layout and scroll positioning only — no data, completion-rule, or stage-logic changes.
