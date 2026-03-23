
## What We're Building

This feature handles a real operational scenario: when an operator choosing SUPERTRANSPORT Shop install for decals/ELD lives far away, it makes no sense to deadhead hundreds of miles before earning revenue. Staff can approve two exceptions — **Paper Logbook** (in place of ELD) and **Temporary Decals** — so the operator can run loads while en route to the shop. This creates a new "approved with exceptions" state that sits between Stage 5 incomplete and Stage 7 fully go-live.

The feature touches Stage 5 (where exceptions originate), introduces Stage 7 (Go Live & Dispatch Readiness), and adds a clear visual indicator on both the Pipeline Dashboard and operator panel that this operator is "dispatched with exceptions."

---

## Technical Plan

### 1. Database Migration
Add columns to `public.onboarding_status`:

```
-- Stage 5 exceptions
paper_logbook_approved     boolean  default false
temp_decal_approved        boolean  default false
exception_notes            text     nullable
exception_approved_by      uuid     nullable  (staff user_id who granted it)
exception_approved_at      timestamptz nullable

-- Stage 7 — Go Live & Dispatch Readiness
dispatch_ready_orientation      boolean  default false
dispatch_ready_consortium       boolean  default false
dispatch_ready_first_assigned   boolean  default false
go_live_date                    date     nullable
operator_type                   text     nullable  ('solo' | 'team')
equip_notes                     text     nullable
```

Also add `'supertransport_shop'` and `'owner_operator_install'` to the `install_method` enum — these are already in a previous migration so we only need to confirm they exist (they do from migration `20260322205234`).

---

### 2. Stage 5 — Exception Block in `OperatorDetailPanel.tsx`

When `decal_method` or `eld_method` is `'supertransport_shop'`, a new collapsible **"Shop Visit Exceptions"** subsection appears inside Stage 5 (below ELD, above Fuel Card). It contains:

- **Paper Logbook Approved** toggle (checkbox/switch) — shown only when `eld_method === 'supertransport_shop'`
- **Temporary Decals Approved** toggle — shown only when `decal_method === 'supertransport_shop'`
- **Exception Notes** textarea (free-text for staff to record the approval context, e.g. "Coming from Tennessee, ~800 miles")
- Auto-stamps `exception_approved_by` and `exception_approved_at` on save when either toggle is turned on for the first time

The Stage 5 **header badge** gets a new state: when one or both exceptions are active (but `eld_installed` or `decal_applied` are still `'no'`), it shows an amber **"Exception Active"** badge instead of the normal in-progress count. When both are fully installed, it reverts to the green "All Equipment Ready" badge.

The Stage 5 **completion logic** gets a new concept: "exception-complete." The stage no longer blocks overall progress if exceptions are approved and the operator is actively running. The dot strip and progress bar will show Stage 5 as amber with a special exception indicator.

---

### 3. Stage 7 — New Stage Block in `OperatorDetailPanel.tsx`

Add a new `Stage 7 — Go Live & Dispatch Readiness` section after Stage 6. It contains:

**Section: Dispatch Readiness Checklist**
- Onboarding orientation call completed (toggle)
- Drug & alcohol consortium enrolled (toggle)
- First dispatch assigned (toggle)

**Section: Go-Live**
- Go-Live Date (date picker) — when set, stage is "complete"
- Operator Type (Solo / Team) dropdown

**Section: Equipment Setup Notes** (moved from the Stage 5 equip_notes field that didn't exist yet, now lives here as a general go-live note)

**Header badge logic:**
- Complete: `go_live_date` is set → green "Go Live Set"
- Partial: any checklist item checked → amber with count
- Empty: no badge

**`OnboardingStatus` type** gains all 9 new fields.

The dot strip and stage refs get a 7th entry.

---

### 4. Stage 5 Completion Logic Update

The `stages` array used for the dot strip and progress bar currently marks Stage 5 complete only when `decal_applied === 'yes' && eld_installed === 'yes' && fuel_card_issued === 'yes'`. We add a new "exception bypass" condition: if `paper_logbook_approved || temp_decal_approved`, Stage 5 is considered **partial** (amber) but not blocking — and the dot shows a special amber color with a small "E" indicator.

In the dot strip tooltip ("Still needed"), when exceptions are active, incomplete items will show as "Pending shop visit (exception approved)" instead of a red blocking item.

---

### 5. Pipeline Dashboard Updates

**`STAGE_KEY_TO_DETAIL` map** gains `dispatch: 'stage7'`.

**`pipeline_config` migration** inserts a new Stage 7 row:
```sql
INSERT INTO pipeline_config (stage_key, label, full_name, stage_order, items, description)
VALUES (
  'dispatch', 'Go Live', 'Go Live & Dispatch Readiness', 7,
  '[{"key":"go_live_date","label":"Go-Live Date Set","field":"go_live_date","complete_value":"present"}]',
  'Final go-live confirmation and dispatch readiness checklist'
);
```

The existing `evalItem` function handles `complete_value: "present"` already, so no logic changes needed in the dashboard.

**Exception indicator on operator rows:** When `paper_logbook_approved = true` or `temp_decal_approved = true`, the operator row in the Pipeline Dashboard gets a small amber **"Exc"** badge in the Stage 5 node tooltip explaining "Exception active — en route to shop."

---

### 6. Operator Portal — Stage 7 Visibility

In `OperatorPortal.tsx`, add a Stage 7 entry to the stages array passed to `OperatorStatusPage`:
- Shows as a milestone node titled "Go Live & Dispatch Readiness"
- Substeps: Orientation Call, Consortium Enrollment, First Dispatch, Go-Live Date
- If `paper_logbook_approved` or `temp_decal_approved` are set, a small note banner appears in Stage 5's substeps: "You have been approved to operate with a paper logbook / temporary decals while en route to the SUPERTRANSPORT shop."

---

### Files to Change

| File | What changes |
|---|---|
| `supabase/migrations/[new].sql` | Add 9 new columns to `onboarding_status`; insert Stage 7 pipeline_config row |
| `src/pages/staff/OperatorDetailPanel.tsx` | Update `OnboardingStatus` type; add exception block to Stage 5; add Stage 7 section; update dot strip to 7 nodes; update stage completion logic |
| `src/pages/staff/PipelineDashboard.tsx` | Add `dispatch: 'stage7'` to `STAGE_KEY_TO_DETAIL` |
| `src/pages/operator/OperatorPortal.tsx` | Add Stage 7 to stages array; add exception note to Stage 5 substeps |
| `src/components/management/ActivityLog.tsx` | Add `go_live_updated` and `exception_approved` action configs |

---

### Summary of New States

```
Stage 5 states:
  ✓ green  = decal + ELD + fuel card all done
  ~ amber  = "Exception Active" (shop install pending, exceptions granted)
  ~ amber  = partial (some done, no exception)
  - gray   = nothing started

Stage 7 states:
  ✓ green  = go_live_date set
  ~ amber  = checklist items started
  - gray   = not started
```
