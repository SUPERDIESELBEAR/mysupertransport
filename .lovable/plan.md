

## Add Driver Name Editing to Contact Info Card

### What changes

When staff click **Edit** on the Contact Info card in the Operator Detail Panel, two new fields — **First Name** and **Last Name** — will appear at the top of the edit form, above the existing Phone and Email fields. Saving updates the name in both the `applications` and `profiles` tables and logs the change to `audit_log`.

### Implementation

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. **Expand `contactDraft` state** to include `first_name` and `last_name` fields. Pre-populate from `applicationData` in `handleContactEdit`.

2. **Add name fields to the edit form** — two inputs in a 2-column row at the top of the editing grid (above Phone/Email).

3. **Update `handleContactSave`**:
   - Include `first_name` and `last_name` in the `applications` table update.
   - Also update `profiles` table with the new name (mirrors what the insert path already does for new applications).
   - If the name changed, insert an `audit_log` entry with old and new values.
   - Update local `operatorName` state so the panel header reflects the change immediately.

4. **Update the read-only view** — the name is already shown in the panel header, so no additional display needed in the card's read-only state.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add first/last name fields to Contact Info edit form; update save handler to persist name changes to both tables and log to audit_log |

