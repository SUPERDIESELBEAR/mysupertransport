## "Ball in Court" Status Indicator

A lightweight handoff signal on every active onboarding driver — visible to staff in the Applicant Pipeline and to the driver in their portal.

### Recommendation: Manual toggle with a smart default

A fully automated rule would require tagging every pipeline item as "driver-owned" vs "staff-owned" — that's a fragile classification effort across 8 stages and ~30+ items, and it would still be wrong any time staff are waiting on an off-system action (a callback, a vendor, an external doc). A single manual toggle, seeded with a sensible default, is simpler, more honest, and matches how onboarding coordinators actually think.

**Tradeoff:** Staff have to flip it (one click) when handoff changes. In return, the signal stays accurate and doesn't fight the data.

To remove busywork, we'll auto-default the value (no manual action needed for the common case) and only ask staff to flip it when they truly hand off.

---

### Data model

Add one column to `onboarding_status`:

- `ball_in_court text` — values: `'driver' | 'staff'`. Default `'driver'` on row creation (a freshly-invited driver always owes the first move).

No new table, no per-item ownership tagging, no enum (keeps migrations cheap).

Optional small additions:
- `ball_in_court_updated_at timestamptz`
- `ball_in_court_updated_by uuid` (staff user id; null when system-set)

RLS: staff (existing onboarding roles) can update; drivers read-only via their existing onboarding_status select policy.

### Auto-default rule (no manual action in the common case)

A tiny DB trigger flips the value automatically in the two unambiguous moments:

1. When a driver submits any onboarding step that completes a stage → set to `'staff'` (driver did their part, staff needs to review).
2. When staff request a correction / revert a step → set to `'driver'` (action bounces back).

Everywhere else, staff can override with a single click. The trigger respects manual overrides made in the last 30 minutes (don't fight the human).

If implementation of the trigger turns out to be more invasive than expected, we ship the manual toggle alone — still simple, still useful.

### Staff UI (Applicant Pipeline only)

A single small badge on each operator card / row, placed next to the existing progress %:

- **Ball: Driver** — muted/neutral chip with a small user icon, label "Waiting on driver"
- **Ball: Staff** — accent/gold chip with a staff icon, label "Needs staff action"

Clicking the badge flips it (with a toast: "Marked as waiting on staff"). Hover shows last-updated timestamp + who set it.

Placement: inline in the existing pipeline table row and the card view — no new column, no new panel, no filter UI in v1 (we can add a "Needs staff action" filter later if it proves useful).

Hidden when `fully_onboarded = true` (matches the OnboardingDaysPill pattern).

### Driver UI (Operator Portal)

A single dismissible banner at the top of the onboarding checklist:

- **Ball in driver's court:** gold-accent banner — "Action required — please complete your pending steps to continue onboarding." Links to the first incomplete stage.
- **Ball in staff's court:** neutral/success banner — "You're all caught up. Our team is reviewing your information."

No new page, no notification spam — just the existing onboarding screen surface.

### Files touched

- **Migration:** add columns + trigger to `onboarding_status`.
- **`src/components/staff/BallInCourtBadge.tsx`** (new) — presentational chip + click-to-flip handler.
- **`src/pages/staff/PipelineDashboard.tsx`** — select `ball_in_court`, render badge in row + card.
- **`src/pages/operator/OperatorPortal.tsx`** (or the onboarding checklist component) — read `ball_in_court`, render the driver banner.
- Types regenerate after the migration.

### Out of scope (deferrable)

- Pipeline filter chip "Needs staff action"
- Driver Hub display (not in onboarding context per earlier decision)
- Per-stage ownership classification / full automation
- Notifications when the ball flips (existing onboarding emails already cover handoffs)
