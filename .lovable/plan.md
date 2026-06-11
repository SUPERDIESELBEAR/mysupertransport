## Problem

When an applicant clicks Save Progress without selecting endorsements or equipment types, the backend save function fails with:

> Couldn't save progress: cannot extract elements from a scalar

## Root cause

The client sends `endorsements` and `equipment_operated` as JSON `null` when nothing is selected. The database function `save_application_draft` checks `p_payload ? 'endorsements'` (key exists — true even when the value is null) and then runs `jsonb_array_elements_text(p_payload->'endorsements')` on that null. Postgres treats a JSON null as a scalar and throws "cannot extract elements from a scalar".

The same bug exists for `equipment_operated`, in both the UPDATE and INSERT branches of the function.

## Fix

Update the `save_application_draft` function so the array-expansion branches only run when the value is actually a JSON array. Replace each guard:

```
CASE WHEN p_payload ? 'endorsements'
     THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
     ELSE endorsements END
```

with:

```
CASE WHEN jsonb_typeof(p_payload->'endorsements') = 'array'
     THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
     WHEN p_payload ? 'endorsements'      -- explicit null clears the value
     THEN NULL
     ELSE endorsements END
```

Apply the same change to `equipment_operated` in both the UPDATE and INSERT branches (the INSERT branch should fall back to `NULL` instead of the column reference).

No client-side changes are required; current payloads (array, null, or omitted) will all save correctly after this migration.

## Verify

1. Publish the app so applicants pick up any current client bundle.
2. As an applicant, open `/apply`, fill Step 1 only, click Save Progress → toast shows "Progress saved · Step 1 of 9".
3. Fill through Step 2 with endorsements selected, Save → still succeeds.
4. Confirm no `[object Object]` or scalar error toasts appear.
