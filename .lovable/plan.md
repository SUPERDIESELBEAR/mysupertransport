
## ICA "In Progress" Draft Workflow

### What's being built

Staff and assigned coordinators can now **pre-fill and save ICA contracts in an "In Progress" state** before they're ready to send. This lets the team work ahead — filling in truck details, compensation, and lease dates days in advance — and only dispatch the ICA to the operator when they're ready.

### Current State
- `ica_status` enum has 3 values: `not_issued → sent_for_signature → complete`
- The `ica_contracts` table already has a `status` field with a `draft` value used internally during `handleSaveDraft`, but this is not surfaced in the UI or the `ica_status` onboarding field
- When staff click "Prepare & Send ICA", the flow goes through all 4 steps and sends immediately — there is no "save and come back later" visible workflow

### What changes

**1. Database migration — add `in_progress` to `ica_status` enum**

```sql
ALTER TYPE public.ica_status ADD VALUE 'in_progress' AFTER 'not_issued';
```

This sits between `not_issued` and `sent_for_signature` so the pipeline/stage logic is unaffected.

**2. `ICABuilderModal.tsx` — separate "Save Draft" from "Save & Come Back"**

- Add a visible **"Save & Close"** button on every step (not just Step 1) that saves all current progress (including carrier signature if already signed) and sets `ica_status = in_progress` on `onboarding_status`
- The existing "Save Draft" ghost button on Step 0 becomes this new persistent action
- When the modal is re-opened for an operator with `status = in_progress`, it **loads the existing draft data** from `ica_contracts` and pre-populates all fields — staff can resume exactly where they left off
- The final **"Send to Operator"** button on Step 3 remains the only action that transitions to `sent_for_signature`

**3. `OperatorDetailPanel.tsx` — surface the in-progress state in Stage 3**

- Add `in_progress` to `icaOptions` dropdown: `{ value: 'in_progress', label: 'In Progress' }`
- Update the ICA button label logic:
  - `not_issued` → "Prepare ICA"
  - `in_progress` → "Continue ICA Draft" (with a `Clock` icon and amber styling)
  - `sent_for_signature` → "View / Edit ICA"
- Show a yellow "Draft in progress" banner when `ica_status === 'in_progress'`, indicating who last edited it and when (from `ica_contracts.updated_at`)
- The Void ICA button remains available for `in_progress` (to clear a bad draft) as well as `sent_for_signature` and `complete`

**4. `SmartProgressWidget.tsx` (operator portal) — no change needed**
The step "ICA prepared by coordinator" already fires when `ica_status === 'sent_for_signature' || 'complete'`. The `in_progress` state is a staff-only internal state that operators don't see.

**5. `ICABuilderModal.tsx` — load existing draft on open**

Add a `useEffect` on mount that queries `ica_contracts` for the operator:
- If a record with `status = 'draft'` exists, pre-populate all `data` fields, `contractId`, and `carrierTypedName`/`carrierTitle`
- Display a "Resuming saved draft" banner at the top

### Files to edit

| File | Change |
|---|---|
| `supabase/migrations/` | Add `in_progress` to `ica_status` enum |
| `src/components/ica/ICABuilderModal.tsx` | Load draft on open, save-and-close on all steps, set `in_progress` status |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add `in_progress` to dropdown, update button labels/states, show draft banner |

### Pipeline / stage impact

The `in_progress` value is **invisible to operators** and does not change the stage calculation logic in `PipelineDashboard.tsx` or `BulkMessageModal.tsx` (both check only `complete` and `sent_for_signature`). The pipeline will still show Stage 3 — ICA for operators with an in-progress draft, which is correct.

### No notification fired for `in_progress`

The `notify_operator_on_status_change` DB trigger only fires notifications for `sent_for_signature` and `complete` — adding `in_progress` to the enum does not trigger any operator-facing notification. Staff-side only.
