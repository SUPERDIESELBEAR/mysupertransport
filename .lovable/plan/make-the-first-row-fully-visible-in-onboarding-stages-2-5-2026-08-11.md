# Make the first row fully visible in onboarding Stages 2–5

## Confirmed current behavior

The Stage 2–5 cards each render a sticky stage-title button followed by the expanded body. The current scroll helper targets the body and calculates an offset from the driver bar height, stage-title height, and a 12px gap, then runs a timed correction loop. The screenshot shows that this coordinate-based correction still leaves Stage 4’s first warning row underneath the sticky title.

## Plan

1. Reproduce the issue in the running Onboarding Pipeline at the reported 731px viewport and record the actual resting positions of the scroll container, driver bar, stage title, expanded body, and first row for Stages 2–5.
2. Replace the fragile body-coordinate calculation with a dedicated first-row scroll anchor for every stage. Scroll that anchor into the actual panel scroll container and enforce clearance using the measured driver-bar and stage-title heights.
3. Correct against visible geometry, not only scroll coordinates: after expansion, compare the first row’s top with the sticky title’s bottom and move the panel only when the row is still covered. Recheck through layout settling, while stopping immediately on user scroll/touch input.
4. Keep the stage title opaque and separated from the body, and ensure the expanded body has a stable top gap so the first row cannot begin beneath the title.
5. Apply the same anchor behavior to stage-header expansion and progress-dot/deep-link navigation for Stages 1–7 and PE, preventing another stage-specific mismatch.

## Verification

At the current 731×779 viewport and desktop width, expand Stages 2, 3, 4, and 5 individually. Confirm in screenshots and measured bounds that each first label/notice/control begins fully below the sticky title with visible spacing. Also confirm collapse, progress-dot navigation, and manual scrolling remain functional.

## Technical scope

- Frontend presentation and scrolling only in `src/pages/staff/OperatorDetailPanel.tsx`.
- No onboarding data, completion rules, or backend changes.
