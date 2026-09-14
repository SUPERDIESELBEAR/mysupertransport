# Screening chips: remove the check mark, keep chips on one row

## What you reported

When a chip earns its ✓ (received), the extra character widens that chip, and the three chips no longer sit on the same row together.

## The change

One edit in `src/components/management/ScreeningChips.tsx`:

- Remove the mark from every state — MVR, PSP, and CH chips always show just the label. No `✓`, no dot, no circle.
- The all-received "Verified" chip also loses its ✓ and shows just "Verified".
- Colors are untouched, so state still reads at a glance: green = received, amber = requested, grey outline = not started. Hover/tap still shows the full wording and dates.

Uniform-width chips are narrower overall, so the three sit on one row consistently.

## Verification (build mode)

1. Screenshot the Screening column at your current window width (1138px), at 1280px, and at phone width, using rows with mixed states (some received, some not).
2. Confirm MVR, PSP, and CH always share one row — including a row where all three are received and where only one or two are received.
