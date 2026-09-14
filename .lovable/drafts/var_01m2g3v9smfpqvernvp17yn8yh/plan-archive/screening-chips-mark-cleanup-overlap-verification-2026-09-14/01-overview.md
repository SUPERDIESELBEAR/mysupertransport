# Screening chips: mark cleanup + overlap verification

## What you asked

1. Verify there is no text overlap in the Screening column on the Applications page.
2. Remove the `○` (not started) and `·` (requested) marks inside the MVR, PSP, and CH chips. Keep the `✓` on received. Chip colors stay exactly as they are.

## Finding from code review

The chips render as `MVR ✓`, `PSP ·`, `CH ○` — a 3-letter label plus a mark inside a rounded pill. At the list's Screening column width (2 of 12 grid columns), three chips can wrap or crowd. Nothing in the code forces overlap, but the chip group uses `flex-wrap`, so in the worst case chips wrap to a second line rather than overlap — overlap should not occur. This will be **confirmed visually** in the preview during build (screenshot of the Screening column at desktop and mobile widths) rather than asserted from code alone.

## The change

One edit in `src/components/management/ScreeningChips.tsx`:

- `not_started` and `requested` chips show just the label (`MVR`, `PSP`, `CH`) with no mark.
- `received` chips keep `✓`.
- The "Verified" collapsed chip (all three received) keeps its `✓`.
- Colors, borders, hover/tap tooltips (full wording + dates) are unchanged, so status is still readable without color alone — the tooltip carries the words, and received keeps its check.
