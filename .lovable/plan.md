## Goal

Make onboarding stages 1–8 behave like Stage 9 / Inspection Binder / Driver Documents: one stage per full-width row, so expanding Stage 2 no longer stretches Stage 1.

## Root cause

In `src/pages/staff/OperatorDetailPanel.tsx` (line ~4723) stages 1–8 are wrapped in `grid grid-cols-1 lg:grid-cols-2 gap-5`. CSS grid equalizes row heights, so an expanded card forces its side-by-side neighbor to grow with empty space. The sections below (Stage 9, Inspection Binder, Driver Documents, Settlement Forecast) are already stacked full-width rows and don't have the problem.

## Changes

**1. Single-column stack**
Replace the two-column grid wrapper with a vertical stack (`space-y-3`) so each stage card is its own full-width row at every breakpoint. Card markup itself is unchanged — only the container.

**2. Tighter collapsed rows**
Because rows are now full-width, collapsed headers get slightly reduced vertical padding (`py-3` instead of `py-4`) so a full 8-stage list stays scannable without excessive scrolling. Status pills, stage icons, and chevrons stay exactly as they are.

**3. Sticky stage header**
Each stage's header button becomes `sticky` with a solid background and a subtle bottom border/shadow when the card is expanded, so while scrolling through a long stage (e.g. Stage 2's document fields) the stage title and status pill stay pinned. Sticky offset accounts for the existing stage-dots / Collapse All toolbar above so headers don't hide under it.

**4. Behavior kept as-is**
- Multiple stages can remain open simultaneously.
- Expand All / Collapse All, the stage-dot jump links, and `stageRefs` scroll targets keep working unchanged.
- Auto-collapse-on-complete logic (e.g. Stage 1 collapsing when MVR/CH is approved) is untouched.

**5. Wide-form check**
With full width available, form field grids inside stages that were sized for a half-width card (`grid-cols-1 sm:grid-cols-2`) will be reviewed so fields don't stretch awkwardly — capping the expanded body content width or promoting dense stages to 2 columns where it reads better. No field, option, or persistence logic changes.

## Technical notes

- Single file: `src/pages/staff/OperatorDetailPanel.tsx`.
- Purely presentational — no changes to `onboarding_status` writes, pipeline config, or stage completion rules.
- Quick-view mode (`isQuickView`) ordering via inline `style.order` is preserved.
