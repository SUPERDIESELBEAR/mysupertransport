## Fix `column "full_name" does not exist` on Move-to-Pending

### Root cause
`public.move_revisions_to_pending` resolves the staff actor name with:

```sql
SELECT COALESCE(full_name, email) INTO v_actor_name
FROM public.profiles WHERE id = v_actor;
```

The `profiles` table has no `full_name` column — it uses `first_name` / `last_name`, and joins via `user_id` (not `id`). When staff click **Move to pending & suggest corrections** the RPC aborts with `column "full_name" does not exist`, so the status change and audit-log entry never happen.

### Fix
Create a new migration that replaces `move_revisions_to_pending` with the same body, except the actor-name lookup is corrected to:

```sql
SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email)
INTO v_actor_name
FROM public.profiles
WHERE user_id = v_actor;
```

Everything else (status update, handled-by-staff stamps, resume-token invalidation, audit-log insert) stays identical.

### Verification
After deploy, re-click **Move to pending & suggest corrections** on Kenneth Woods' application and confirm:
- toast no longer shows the SQL error
- status flips to `pending`
- revision banner still shows "sent May 15, 2026 · now handled by staff"
- a `application.revisions_moved_to_pending` row appears in the audit log
