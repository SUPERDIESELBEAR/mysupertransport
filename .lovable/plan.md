# Onboarding progress counter — root cause + fix

## What the data says

I queried Emma's live `onboarding_status` row. Stages 1–4 evaluate to `complete` under the existing logic (MVR/CH approved + PE clear, all four Stage‑2 docs received, ICA `complete`, registration `own_registration`). Stages 5–8 are not started. The correct count is **4 of 8 (50%)**.

## Why the screenshot shows 0% even though the dots are green

Both the dot bar and the header text in `OnboardingChecklist` already derive from the **same** `stages` array via the fix added last turn:

```ts
const derivedCompletedStages = stages.filter(s => s.status === 'complete').length;
const displayCompletedStages  = stages.length > 0 ? derivedCompletedStages : completedStages;
const displayProgressPct      = stages.length > 0 ? derivedProgressPct    : progressPct;
```

It is mathematically impossible for the dots to show 4 green and the same render to print "0 of 8" — unless the running bundle is **not** the fixed bundle. The ICA green banner is rendered by code added in that same patch set, so the page is clearly running newer code… but the progress strip is rendered by a separate lazy chunk (`OnboardingChecklist` / `OperatorStatusPage` mobile branch) which the installed PWA service worker is still serving from cache. `public/version.json` has not been bumped since the previous patch, so the version-check hook never prompts a reload.

## Fix

1. **Force PWA clients to pick up the patched chunks.** Bump `public/version.json` (`version` + `buildTime`). `useVersionCheck` / `useAppRefresh` will detect the new build and reload all installed clients on next focus.

2. **Collapse to a single source of truth at the portal level** so a stale child prop can never disagree with the dots again:
   - In `src/pages/operator/OperatorPortal.tsx`, the existing `completedStages` / `progressPct` (lines 836–837) already derive from `stages.filter(s => s.status === 'complete')`. Wrap them in `useMemo([stages])` and keep that as the only place the math lives.
   - In `src/components/operator/OnboardingChecklist.tsx` and `src/components/operator/OperatorStatusPage.tsx`, **always** use the derived values when `stages.length > 0` (drop the `progressPct`/`completedStages` fallback branch entirely — props become advisory only). This kills any path where a stale prop could surface a zero.
   - Add a one-line dev-only `console.warn` if `props.completedStages !== derivedCompletedStages` to catch any future drift.

3. **Verification**
   - Re-run the stage math query for Emma (`c49e2427-…`) → expect 4 complete.
   - Pick a second live driver in onboarding (any operator with `mvr_ch_approval='approved'` AND `pe_screening_result='clear'` but `insurance_added_date IS NULL`) and confirm their derived count matches what their portal renders.
   - On Emma's PWA: pull to refresh / reopen → header should read **50% · 4 of 8 done**, dots unchanged, no other UI side-effects.

## Files touched

- `public/version.json` — bump version + buildTime
- `src/pages/operator/OperatorPortal.tsx` — memoize `completedStages` / `progressPct`
- `src/components/operator/OnboardingChecklist.tsx` — make derived values authoritative
- `src/components/operator/OperatorStatusPage.tsx` — make derived values authoritative

No DB migration, no business‑logic change to which stages count as complete.
