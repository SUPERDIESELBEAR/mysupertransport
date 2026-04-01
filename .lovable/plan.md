

## Fix "Update" Link on Missing Compliance Dates Ribbon

### Problem
When clicking "Update" on the yellow compliance ribbon for operators without an application record (e.g., Marcus Mueller added via Add Driver), nothing happens. The `onOpenAppReview` handler in `StaffPortal.tsx` queries `operators.applications`, finds `null`, and silently returns without opening anything.

### Root Cause
The handler at line ~548 in `StaffPortal.tsx`:
```ts
onOpenAppReview={async (focusField) => {
  const { data: op } = await supabase
    .from('operators')
    .select('application_id, applications(*)')
    .eq('id', selectedOperatorId)
    .single();
  if (op?.applications) {        // ← null for non-applicant operators
    setReviewApp(op.applications);
    setReviewFocusField(focusField);
  }
  // else: nothing happens — no feedback, no fallback
}}
```

### Solution
When no application record exists, **create one on the fly** (same pattern used for contact-info save), then open the `ApplicationReviewDrawer` with the new record so the user can enter the CDL/Med Cert expiration dates.

### Changes — `src/pages/staff/StaffPortal.tsx`

In the `onOpenAppReview` callback (~line 548, and the duplicate at ~line 700):

1. After the query, if `op?.applications` is `null`:
   - Fetch the operator's profile (`first_name`, `last_name`, `phone`, `home_state`) and email from `profiles`
   - Insert a new `applications` row with `user_id`, `first_name`, `last_name`, `review_status: 'approved'`, `is_draft: false`, and empty compliance fields
   - Update `operators.application_id` to link the new record
   - Set `reviewApp` to the newly created application so the drawer opens
2. If the insert fails, show a toast with the error

This reuses the same "create application for non-applicant" pattern already established in the contact-info save logic.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/StaffPortal.tsx` | In all `onOpenAppReview` callbacks, create an application record when none exists, then open the review drawer |

