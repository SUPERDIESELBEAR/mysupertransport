# Targeted Security Fix (database only)

Three scoped changes. No table, RLS policy, or `authenticated` grant is touched.

## 1. Authorize callers of `get_staff_contact_info`

Today the function returns staff contact info to anyone who calls it, with no check on who is calling. It will be changed to require a signed-in caller who is either staff or an operator.

- If `auth.uid()` is null: raise `Not authenticated`.
- Else if not (`public.is_staff(auth.uid())` or `public.has_role(auth.uid(), 'operator')`): raise `Not authorized`.
- The subject-side filter `public.is_staff(p.user_id)` stays exactly as-is.
- Signature `get_staff_contact_info(_user_ids uuid[])` and all five returned columns (`user_id`, `first_name`, `last_name`, `avatar_url`, `primary_role`) are unchanged, so no frontend change is needed.

Technical note: the function is currently `LANGUAGE sql`, which cannot raise. It will be rewritten as `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public` with the identical query in a `RETURN QUERY`, preserving the same `RETURNS TABLE` shape.

## 2. Revoke `anon` EXECUTE on six functions

`REVOKE EXECUTE ... FROM anon` on:

- `assign_user_role(uuid, app_role)`
- `remove_user_role(uuid, app_role)`
- `search_audit_log(...)` — both overloads
- `get_staff_contact_info(uuid[])`
- `get_pei_queue()`
- `set_go_live_with_override(...)`

`authenticated` keeps EXECUTE on all six. No other function's grants change, so the public application/share-link flows (`submit_application_draft`, `save_application_draft`, `check_application_email_taken`, `consume_application_resume_token`, `resolve_share_token`, `get_inspection_doc_by_token`, `get_application_by_draft_token`) remain anon-callable.

## 3. Pin search path on `_app_correction_editable_columns`

`ALTER FUNCTION public._app_correction_editable_columns() SET search_path = public;` — logic untouched (it returns a static text array).

## Explicitly not changed

- `application_resume_tokens`, `document_short_links`, `message_notification_throttle` stay policy-less / service_role only.
- `pg_trgm`, `vector`, `pg_net` stay in `public`.
- No `authenticated` grants are revoked anywhere.

## Verification

Re-run the linter and confirm the six functions no longer appear as anon-executable and the mutable-search-path warning is gone; confirm `get_staff_contact_info` still returns rows for a staff caller.
