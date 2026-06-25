## Plan: Remove the quick-action buttons from Stage 1 & Stage 2

Yes — in the last round I added two blue quick-action buttons to the management Operator Detail panel:
- **"Approve Stage 1"** (appears above Stage 1 when MVR/CH are received and a PE result is entered)
- **"Mark all Stage 2 received"** (appears above Stage 2 when all four documents have uploads)

You want these removed.

### Changes

**File:** `src/pages/staff/OperatorDetailPanel.tsx`

1. Remove the JSX that renders both buttons at the top of the Stage 1 and Stage 2 sections.
2. Remove the `bulkUpdateStatusAndPersist` helper that was added solely to power those buttons (if not referenced elsewhere).
3. Leave intact:
   - The per-field auto-save on Stage 1/2 dropdowns (`updateStatusAndPersist`)
   - The `operator_id` fallback and error-revert hardening
   - The driver portal realtime sync work
   - The completion-indicator logic that reads from saved `onboarding_status`

### Result
Management goes back to the previous flow: staff change each Stage 1/2 dropdown individually and each one auto-saves on change. No bulk blue buttons. Driver portal behavior is unchanged.
