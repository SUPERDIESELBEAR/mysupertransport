# Make Stage 8 actionable when not started

## Problem

Stage 8 (Contractor Pay Setup) is the only stage that is operator-actionable from day one with no staff prerequisite. But it shares the same `not_started` styling as staff-gated stages (5, 6, 7), so the entire card renders at `opacity-60` and the "Complete Pay Setup" CTA reads as disabled — even though it's clickable.

## Fix

Single-file change in `src/components/operator/OnboardingChecklist.tsx`:

1. **Skip the dim opacity for Stage 8.** Replace the wrapper's `${colors.opacity}` with a computed value that returns `''` when `stage.number === 8 && isNotStarted`, otherwise uses `colors.opacity` as today.
2. **Show substeps for Stage 8 even when `not_started`.** Update `showSubsteps` to `stage.substeps.length > 0 && (!isNotStarted || stage.number === 8)` so the "Pay Setup — Pending" row is visible inside the card.
3. **Auto-expand Stage 8 when `not_started`.** Change the `expanded` initial state to start expanded for Stage 8 in this state, so the operator immediately sees the substep + CTA without tapping the header.

The existing `showPaySetupCTA` already includes `not_started`, so the gold CTA button stays where it is — it just stops looking dimmed.

No changes to other stages, the database, or any flow.

## Verification

Log in as Marcus and confirm:
- Stage 8 card renders at full opacity (not dimmed).
- "Pay Setup — Pending" substep is visible.
- "Complete Pay Setup" CTA is bright gold and tapping it opens the pay setup view.
- Other `not_started` stages (1, 5, 7) still appear dimmed exactly as before.
