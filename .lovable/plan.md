# Stage 7 Cleanup — Go Live & Dispatch Readiness

Tighten Stage 7 in the Applicant/Operator pipeline (Staff → Operator Detail Panel) by removing the three readiness checkboxes, defaulting Operator Type to "Solo Driver", and reordering so Operator Type appears above Go-Live Date.

## Changes

**File:** `src/pages/staff/OperatorDetailPanel.tsx`

### 1. Stage 7 panel UI (around lines 5721–5795)
- **Remove** the entire "Dispatch Readiness Checklist" block (the 3 checkboxes: Onboarding orientation call, Drug & alcohol consortium enrolled, First dispatch assigned).
- **Remove** the "{checkedCount}/3 ready" partial-progress badge in the stage header (and the `s7Partial` / `checkedCount` logic that powers it). Stage 7 will simply be either complete (Go-Live Date set) or not.
- **Reorder** inside the stage body so the section now reads:
  1. **Operator Type** (Select: Solo Driver / Team Driver) — moved above Go-Live
  2. **Go-Live Date** (StageDatePicker)
- Keep the existing "Go-Live confirmed" success banner unchanged.

### 2. Default Operator Type to Solo Driver
- When loading an operator whose `operator_type` is null/empty, treat it as `'solo'` in the UI.
- On Stage 7 first render for an operator with no `operator_type` set, persist `'solo'` to `onboarding_status.operator_type` via the existing `updateStatus('operator_type', 'solo')` path so the default is saved (one-time backfill per operator).
- Select control will always show a value (never the "—" placeholder).

### 3. Progress/summary references (lines 3327–3332 and 4011–4016)
- Remove the three readiness items from the Stage 7 `items` arrays in both progress widgets so the stage's drill-down only shows: `Go-Live Date Set`.
- The mini-stage indicator at line 3441–3444 currently uses the readiness flags to compute a `progress` state — simplify so Stage 7 is `complete` when `go_live_date` is set, otherwise `none`.

### 4. Leave alone
- Database columns `dispatch_ready_orientation`, `dispatch_ready_consortium`, `dispatch_ready_first_assigned` remain in `onboarding_status` (no migration). They simply stop being written/read by the UI. This is non-destructive and reversible.
- All other stages, audit logging on go-live, and dispatch history remain unchanged.

## Notes for follow-up
Once you decide on the new checklist item names, share them and I'll add a fresh checklist section in Stage 7 (or wherever you'd like).
