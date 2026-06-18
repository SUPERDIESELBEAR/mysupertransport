## Problem
On-hold reasons in the applicant pipeline are truncated (`truncate max-w-xs`). Staff cannot read the full reason.

## Recommended fix: Tooltip on hover
A **Tooltip** is the best UX choice here because:
- The on-hold list is a dense row layout; inline expansion would push the StageTrack and action buttons around.
- Tooltips are already used throughout this file (archive button, deactivated date).
- Zero layout shift — the row stays compact.
- Works on desktop (hover) and mobile (tap/long-press).

## Changes
**File:** `src/pages/staff/PipelineDashboard.tsx` (~line 3609)

Replace the plain `<span>` for `op.on_hold_reason` with a `<TooltipProvider>` + `<Tooltip>` + `<TooltipContent>` that displays the full reason text. Keep the same `truncate max-w-xs italic` styling on the trigger span.

No other files touched.

## Acceptance
- Hovering (or tapping on mobile) the truncated on-hold reason reveals the full text in a tooltip.
- The row layout remains unchanged.
- No new dependencies.