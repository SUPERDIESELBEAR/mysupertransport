## Total Onboarding Days Ticker

Add a staff-only "days in onboarding" indicator on the Applicant Pipeline for drivers who haven't completed onboarding (no go-live yet). Counts days elapsed since `applications.submitted_at`.

### Placement

**Applicant Pipeline only** (`src/pages/staff/PipelineDashboard.tsx`) — both the card view and the table view. This is where staff triage follow-ups, so the ticker lives directly on each in-progress operator as a small color-coded pill (e.g. `Day 14`) next to the existing stage badge.

Hidden as soon as the operator is `fully_onboarded` (i.e., they have a go-live), matching your "no longer needed once onboarding completes" rule.

**Deferred (noted, not built now):** an Overview widget like "X drivers > 30 days in onboarding". Easy follow-up once the shared component exists. The Driver Hub is intentionally **not** included — that surface is for post-go-live operations, where this metric no longer applies.

### Ticker behavior

- Source of truth: `applications.submitted_at` (already on the pipeline query — needs to be added to the select list).
- Label: `Day N` where `N = floor((now - submitted_at) / 1 day) + 1` (Day 1 = submission day, US Central, matching existing date policy).
- Color thresholds (using existing semantic status tokens, no hardcoded colors):
  - 1–14 days → green (`status-complete` family)
  - 15–30 days → amber (existing warning tokens)
  - 31+ days → red (`status-alert` / destructive)
- Tooltip on hover: "Application submitted Mon DD, YYYY" (existing `Tooltip` component).
- Renders nothing when `submitted_at` is null (draft) or the operator is `fully_onboarded`.

### Implementation outline

1. New shared component `src/components/staff/OnboardingDaysPill.tsx`
   - Props: `submittedAt: string | null`, `fullyOnboarded: boolean`, optional `size`.
   - Computes day count + threshold class, wraps a `Tooltip`. Returns `null` when it shouldn't render.
   - Uses CT noon-anchoring helper consistent with existing date policy.

2. `PipelineDashboard.tsx`
   - Extend the `applications (...)` sub-select on the operators query to include `submitted_at`.
   - Add `submitted_at` to the row mapping.
   - Render `<OnboardingDaysPill />` in the operator card header and the table-view name cell.

### Out of scope

- No schema changes — `submitted_at` already exists.
- No operator-facing UI touched.
- No Driver Hub changes.
- No new RLS / edge functions.
