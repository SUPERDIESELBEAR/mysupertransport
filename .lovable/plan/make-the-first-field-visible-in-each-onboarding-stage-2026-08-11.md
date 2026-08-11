# Make the first field visible in each onboarding stage

## What's happening

Each stage card in the driver detail panel has a title bar that pins itself under the sticky driver bar while you scroll (`sticky` with `top: stickyBarHeight`). The stage body starts immediately under that bar with only 8px of padding, so as soon as the card scrolls even slightly, the stage's first control — the "Registration Status" dropdown in Stage 2, "ICA Status" in Stage 3, and the equivalent first dropdowns in Stages 4 and 5 — slides underneath the pinned title and shows half-cut, with its section label hidden entirely. That is the sliced ribbon in the screenshots.

Two things contribute:
- The pinned title bar has no visual bottom edge, so content sliding under it reads as a broken/clipped field rather than as scrolled-away content.
- When a stage is expanded, the scroll helper offsets only by the driver bar height, not by the stage title bar's own height, so the card lands with its first field already tucked under its own pinned title.

## The fix

1. Offset expanded-stage scrolling by both pinned bars — driver bar height plus the stage's own title bar height plus a small gap — so opening a stage always lands with the first section label and dropdown fully visible.
2. Give the pinned stage title bar a solid bottom edge (border plus subtle shadow) so content passing under it clearly reads as scrolled content, not a cut-off field.
3. Add a little more breathing room at the top of each expanded stage body so the first label is never flush against the pinned bar.
4. Apply this uniformly to every stage card (1 through 7 plus the PE stage) so all stages behave identically.

No data or business-logic changes — layout and scroll positioning only.

## Technical notes

- `src/pages/staff/OperatorDetailPanel.tsx`
  - `scrollStageIntoView` (~line 735): measure the stage's own sticky title bar (first child of the stage ref) and include its height in `offset`; keep the existing settle re-correction.
  - Stage title buttons (~lines 4744, 4857, 5210, 5439, 5522, 5754, 5929, 6324): add a bottom border and shadow so the pinned bar separates visually from body content.
  - Stage body wrappers: bump `pt-2` to a slightly larger top pad.
- Verify at the current 731px viewport and on desktop that Stages 2, 3, 4 and 5 each show their first section label and dropdown in full after expanding.