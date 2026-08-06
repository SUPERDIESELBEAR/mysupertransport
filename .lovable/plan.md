# Why the onboarding percentages disagree — and how to fix it

## What's happening

David Mitchell's detail page draws three progress readouts, and each one counts stages using its own separately hand-written list and its own rules. They were written at different times and never linked together, so they drift apart.

| Readout | Stages counted | Notable rule |
| --- | --- | --- |
| Sticky header "56%" | 9 (BG, Docs, ICA, MO, Systems, PE, Ins, Go Live, Pay) | MO Reg only counts when a Missouri plate is received — a driver on their own registration is counted incomplete |
| "6 of 9 stages complete / 67%" | 9 (same list) | MO Reg counts as complete when the driver has their own registration (N/A = done) |
| "ONBOARDING PROGRESS 4 / 8" | 8 — Pay Setup is missing entirely | MO Reg strict again, so it and Pay both drag the count down |

So for this driver: the middle card gives MO Reg credit (6/9 = 67%), the sticky bar does not (5/9 = 56%), and the bottom card neither gives MO credit nor counts Pay at all (4/8 = 50%, shown as 4/8). There is also a fourth, 7-stage dot strip lower on the page.

None of these read the `pipeline_config` table — they're all inline literals inside `OperatorDetailPanel.tsx`.

## Proposed fix

Create one shared stage-progress calculator and have every indicator on the page consume it.

1. Add `src/lib/onboardingProgress.ts` exporting a single `getOnboardingStages(status, paySetupRecord)` returning an ordered array of `{ key, label, shortLabel, complete, notApplicable, exception }`.
2. Canonical stage set: the 9 stages (Background, Documents, ICA, MO Reg, Onboard Systems, PE Screening, Insurance, Go Live, Pay Setup).
3. Canonical rules, applied everywhere:
   - MO Reg is marked **N/A** when the driver is on their own registration, and N/A stages are excluded from the denominator rather than counted as complete.
   - Onboard Systems keeps the temp-decal / paper-logbook exception flag for styling, but completion stays the strict decal + ELD + fuel card check.
   - Pay Setup is included in all three readouts.
4. Rewrite the three blocks in `OperatorDetailPanel.tsx` (sticky header, top completion summary, Onboarding Progress card) plus the small dot strip to render from that one array, so the percentage and the "X of Y" count are always identical.

## Decision needed

For a driver on their own registration, should MO Reg be **excluded from the total** (8 stages, cleanest) or **counted as complete** (9 stages, matches today's middle card)? The plan currently assumes excluded — say the word and I'll switch it.

## Technical notes

- All edits are confined to `src/pages/staff/OperatorDetailPanel.tsx` (blocks around lines 2902-2935, 3861-3960, 4614-4652, 4731-4810) plus the new shared lib file.
- No database or schema changes; purely presentation logic.
