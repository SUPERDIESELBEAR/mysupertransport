## What's happening

When the applicant signs and clicks **Approve & sign**, the browser shows "Edge Function returned a non-2xx status code". The edge function `respond-application-correction` is fine — it's the database RPC behind it that's throwing.

Reproduced by dry-running `approve_application_correction(...)` against the pending request in the database:

```
ERROR: column reference "request_id" is ambiguous
QUERY: SELECT field_path, new_value FROM public.application_correction_fields WHERE request_id = v_req.id
```

## Root cause

Both `approve_application_correction` and `reject_application_correction` declare their return columns with `RETURNS TABLE(request_id uuid, …)`. Postgres treats those OUT names as PL/pgSQL variables inside the body. The loop that reads pending field edits uses an unqualified `request_id` in its WHERE clause, which now collides with the OUT variable of the same name — so every approval (and any reject path that does the same query) errors out before any field is applied.

This bug only surfaces now because we recently started writing `employers` rows to `application_correction_fields` — but it would fire on any field change.

## Fix

Create a new migration that replaces both functions with the column reference qualified by the table alias. No behavior change beyond unblocking execution.

- In `approve_application_correction`, rewrite the loop as:
  ```sql
  FOR v_field IN
    SELECT f.field_path, f.new_value
    FROM public.application_correction_fields f
    WHERE f.request_id = v_req.id
  LOOP …
  ```
- In `reject_application_correction`, no loop today, but defensively alias any future references the same way and keep the OUT column name.
- Keep the existing `RETURNS TABLE(request_id uuid, application_id uuid)` signature so the edge function and client contracts don't change.

## Verification

1. Re-run the same dry-run (`BEGIN; SELECT approve_application_correction(...); ROLLBACK;`) against the existing pending token — expect a row returned and no error.
2. From the applicant view in preview, sign and click **Approve & sign** — toast should disappear, success screen renders, and the `employers` array on the application updates to the proposed value.
3. Test reject path with a separate pending request to confirm parity.

No frontend, edge function, or schema changes required — only the two SQL function bodies.
