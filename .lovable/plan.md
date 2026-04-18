

The user has chosen the approach: keep operators with open Stage 5 exceptions in the Applicant Pipeline (block graduation to Driver Hub) until Stage 5 is fully complete, and place this new section at the **top** of the Pipeline.

Let me confirm the relevant details before finalizing.

## Plan: "Active w/ Open Stages" section at top of Applicant Pipeline

### Concept

When an operator hits "fully onboarded" (insurance added) but Stage 5 still has open items (decal, ELD, fuel card not finalized — i.e., they're dispatching under an exception like paper logbook or temp decal), they should:

1. **Stay visible at the TOP of the Applicant Pipeline** in a new "Active — Open Onboarding Items" section
2. **Also appear in the Driver Hub** (so dispatch can use them)
3. **Auto-graduate** off the Pipeline once Stage 5 is genuinely complete

This is the "dual visibility" safety net — operators are dispatchable, but coordinators can't forget about open items.

### Trigger condition

An operator appears in the new top section when ALL of:
- `onboarding_status.insurance_added_date IS NOT NULL` (would normally graduate them)
- AND Stage 5 is not fully complete — i.e., any of:
  - `decal_applied !== 'yes'`
  - `eld_installed !== 'yes'`
  - `fuel_card_issued !== 'yes'`
  - OR an active exception flag is set: `paper_logbook_approved = true` or `temp_decal_approved = true`

Once Stage 5 closes (all three "yes" + exceptions cleared), they drop off the Pipeline automatically and remain only in the Driver Hub.

### UI changes

**`src/pages/staff/PipelineDashboard.tsx`**
- Modify the operator-fetch filter so `fully_onboarded = true` operators are still included **if** Stage 5 is incomplete
- Group results into three sections, rendered top-to-bottom:
  1. **🟡 Active — Open Onboarding Items** (NEW, at top) — fully_onboarded but Stage 5 open
  2. **In Pipeline** (existing) — not fully onboarded
  3. (existing other sections like Stalled, etc., remain in their current order below)
- New section header styling matches existing section headers (gold accent, count badge)
- Each row in the new section gets an "Open: Decal, ELD" style chip showing what's still pending, plus an "Active w/ Exception" badge if `paper_logbook_approved` or `temp_decal_approved` is true

**`src/components/operator/OperatorStatusPage.tsx`** (operator-facing, optional polish)
- No change needed — operator still sees normal Stage 5 "Pending" status

### No DB / backend changes
- `fully_onboarded` generated column stays as-is (Driver Hub continues using it)
- No migration, no edge function changes, no notification timing changes

### Files to change

| File | Change |
|---|---|
| `src/pages/staff/PipelineDashboard.tsx` | Adjust query filter to include Stage-5-open onboarded operators; add new top section with header + filtered list; add "open items" chips |

### Why this is safe
- Driver Hub behavior unchanged — dispatch can still use these operators
- Pipeline gets a richer, safer view — coordinators see exactly who still owes Stage 5 work
- Auto-clears once Stage 5 is closed — no manual cleanup needed
- Pure UI/query change — no schema, no triggers, no notifications affected

### After deploying
1. Operator gets insurance added → still graduates to Driver Hub (dispatch uses them)
2. **Same operator now also pinned at the top of Applicant Pipeline** under "Active — Open Onboarding Items" with chips like "Open: ELD, Fuel Card • Exception: Paper Logbook"
3. Coordinator finishes Stage 5 (decal + ELD + fuel card all "yes") → operator quietly drops off the Pipeline, stays in Driver Hub

