
## What We're Building

This feature handles a real operational scenario: when an operator choosing SUPERTRANSPORT Shop install for decals/ELD lives far away, it makes no sense to deadhead hundreds of miles before earning revenue. Staff can approve two exceptions — **Paper Logbook** (in place of ELD) and **Temporary Decals** — so the operator can run loads while en route to the shop. This creates a new "approved with exceptions" state that sits between Stage 5 incomplete and Stage 7 fully go-live.

The feature touches Stage 5 (where exceptions originate), introduces Stage 7 (Go Live & Dispatch Readiness), and adds a clear visual indicator on both the Pipeline Dashboard and operator panel that this operator is "dispatched with exceptions."

---

## Technical Plan

### 1. Database Migration ✅ COMPLETE

Added columns to `public.onboarding_status`: ✅
- `paper_logbook_approved`, `temp_decal_approved`, `exception_notes`, `exception_approved_by`, `exception_approved_at` (Stage 5 exceptions)
- `dispatch_ready_orientation`, `dispatch_ready_consortium`, `dispatch_ready_first_assigned`, `go_live_date`, `operator_type` (Stage 7)
- `supertransport_shop` and `owner_operator_install` confirmed present in `install_method` enum ✅

---

### 2. Stage 5 — Exception Block in `OperatorDetailPanel.tsx` ✅ COMPLETE

- **Shop Visit Exceptions** subsection with Paper Logbook and Temporary Decals toggles ✅
- **"Exception Active"** amber badge in Stage 5 header when exceptions are on ✅
- Auto-stamps `exception_approved_by` and `exception_approved_at` on first toggle ✅
- Dot strip shows amber **"E"** node for Stage 5 when exceptions are active ✅
- Tooltip items show "Pending shop visit (exception approved)" instead of blocking red ✅

---

### 3. Stage 7 — New Stage Block in `OperatorDetailPanel.tsx` ✅ COMPLETE

- Dispatch Readiness Checklist (Orientation, Consortium, First Dispatch) ✅
- Go-Live Date picker — green "Go Live Set" badge when set ✅
- Operator Type (Solo / Team) dropdown ✅
- 7-node dot strip and stage refs ✅
- Audit log entry written on go-live save ✅

---

### 4. Stage 5 Completion Logic Update ✅ COMPLETE

- Exception bypass condition: `paper_logbook_approved || temp_decal_approved` renders Stage 5 amber but non-blocking ✅
- Dot strip "Still needed" tooltip shows "pending shop visit" context when exception is active ✅

---

### 5. Pipeline Dashboard Updates ✅ COMPLETE

- `dispatch: 'stage7'` added to `STAGE_KEY_TO_DETAIL` map ✅
- Stage 7 `pipeline_config` row inserted ✅
- Amber **"E"** circle on equip node with "Exception active — en route to shop" tooltip ✅
- **Exception Active** filter chip with live operator count ✅
- **Exception Active guidance banner** below filter toolbar — "X operators running under an approved exception — en route to the SUPERTRANSPORT shop for installation" ✅

---

### 6. Operator Portal — Stage 7 Visibility ✅ COMPLETE

- Stage 7 milestone node added to `OperatorPortal.tsx` ✅
- Substeps: Orientation Call, Consortium Enrollment, First Dispatch, Go-Live Date ✅
- Exception note banner in Stage 5 substeps when `paper_logbook_approved` or `temp_decal_approved` are set ✅

---

### 7. Notifications ✅ COMPLETE

All operator notifications implemented via `notify_operator_on_status_change` DB trigger:

- **⚠️ Exception approved — Paper Logbook** — fires when `paper_logbook_approved` flips to `true` ✅ (verified)
- **⚠️ Exception approved — Temporary Decals** — fires when `temp_decal_approved` flips to `true` ✅ (verified)
- **🚛 Go-live date confirmed!** — fires when `go_live_date` is set, includes formatted date in body ✅

---

### Files Changed

| File | What changed |
|---|---|
| `supabase/migrations/[new].sql` | 9 new columns on `onboarding_status`; Stage 7 `pipeline_config` row |
| `src/pages/staff/OperatorDetailPanel.tsx` | Exception block (Stage 5); Stage 7 section; 7-node dot strip; completion logic; audit log on save |
| `src/pages/staff/PipelineDashboard.tsx` | `dispatch: 'stage7'` mapping; exception E-node; Exception Active chip; guidance banner |
| `src/pages/operator/OperatorPortal.tsx` | Stage 7 milestone; exception note banner in Stage 5 |
| `src/components/management/ActivityLog.tsx` | `go_live_updated` and `exception_approved` action configs |

---

### Summary of States

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
