
## Root Cause

In `OnboardingChecklist.tsx`, line 132 defines:
```tsx
const showPaySetupCTA = stage.number === 8 && (stage.status === 'not_started' || stage.status === 'in_progress');
```
But the CTA renders inside:
```tsx
{showSubsteps && expanded && (
  ...
  {showPaySetupCTA && (...)}
)}
```
`showSubsteps = stage.substeps.length > 0 && !isNotStarted` — so when Stage 8 is `not_started`, `showSubsteps` is `false` and the entire block (including the CTA) is never rendered. The stage card shows only the hint text with no way to open the pay setup form.

On desktop (`OperatorStatusPage.tsx`), `MilestoneNode` has no CTA button logic at all for Stage 8.

---

## Fix

### 1. `OnboardingChecklist.tsx` — render the CTA outside the substeps gate

Add a second render block after the "not-started hint" section that shows the Pay Setup CTA unconditionally for Stage 8 when `not_started` or `in_progress`, regardless of `showSubsteps`:

```
{/* Pay Setup CTA — shown even when not_started */}
{showPaySetupCTA && (
  <div className="px-3 pb-2.5">
    <Button ...>Complete Pay Setup</Button>
  </div>
)}
```

This replaces the need to gate it through `showSubsteps`.

### 2. `OperatorStatusPage.tsx` — add CTA to `MilestoneNode` for Stage 8

Inside `MilestoneNode`, after the substeps section, add:

```
{stage.number === 8 && (stage.status === 'not_started' || stage.status === 'in_progress') && (
  <button onClick={() => onNavigateTo('pay-setup')} ...>
    Complete Pay Setup →
  </button>
)}
```

`MilestoneNode` needs to receive `onNavigateTo` — it currently doesn't. The prop must be threaded from `OperatorStatusPage` → `MilestoneNode`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/operator/OnboardingChecklist.tsx` | Move CTA out of substeps gate — show it for `not_started` Stage 8 |
| `src/components/operator/OperatorStatusPage.tsx` | Add `onNavigateTo` to `MilestoneNode`, add Stage 8 CTA inside milestone card |

No database changes. No new files. No routes changed.
