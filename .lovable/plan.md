## Root cause (confirmed)

I reproduced the failing save by calling `save_application_draft` directly with the same payload shape the form sends. PostgREST returns:

```
code:    42804
message: column "signed_date" is of type date but expression is of type text
hint:    You will need to rewrite or cast the expression.
```

Why this happens:
- `defaultFormData.signed_date` is built with `new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })` — a human string like `"June 10, 2026"`.
- The `save_application_draft` RPC writes `p_payload->>'signed_date'` straight into the `signed_date` column (a `date`) without any cast, so Postgres rejects every draft save the moment that field is present (which it always is).
- The toast then prints `[object Object]` because `saveDraft` does `err instanceof Error ? err.message : String(err)`, and the Supabase/PostgREST error is a plain object — not an `Error` — so `String(err)` collapses to `[object Object]` and hides the real reason.

That single column is why every Save Progress click silently fails, regardless of step or content. The autosave timer and step-change autosave hit the exact same wall.

## Plan

### 1. Migration: stop forcing a text date through the RPC

Update `public.save_application_draft` so `signed_date` is treated the same way as the other date columns: only written when it is a valid ISO `YYYY-MM-DD` string, otherwise left null / unchanged.

- In the UPDATE branch: `signed_date = CASE WHEN p_payload->>'signed_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (p_payload->>'signed_date')::date ELSE signed_date END`.
- In the INSERT branch: `CASE WHEN p_payload->>'signed_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (p_payload->>'signed_date')::date ELSE NULL END`.
- Keep `SECURITY DEFINER`, signature, and grants unchanged.

This is the minimum change that makes saves succeed today without touching the submitted-application flow or column type.

### 2. Client: send an ISO date and decouple display from storage

In `src/components/application/types.ts`:
- Change `defaultFormData.signed_date` from the localized string to `new Date().toISOString().slice(0, 10)` so the stored value is always a valid `YYYY-MM-DD`.

In `src/components/application/utils.ts` (`buildPayload`):
- Normalize `signed_date` defensively: if it doesn't match `^\d{4}-\d{2}-\d{2}$`, send `null` instead. Keeps drafts safe even if older form state slips through.

In `src/components/application/Step9Signature.tsx`:
- Wherever the signed date is shown to the applicant, render the friendly version with `new Date(data.signed_date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })` (matches the project's noon-anchor date rule).

This preserves the "Month DD, YYYY" UX while making the persisted value DB-safe.

### 3. Client: surface real save errors instead of `[object Object]`

In `src/pages/ApplicationForm.tsx` `saveDraft` catch block:
- Extract a readable message from any error shape: prefer `err.message`, fall back to `err.error_description`, then `err.details`, then `JSON.stringify(err)` (capped to ~300 chars). Same helper used by both manual and silent autosave paths (silent path still skips the toast, but logs the readable message to the console).
- Also log `code`, `details`, and `hint` to the console when present so future regressions are diagnosable from the browser console without server access.

No other change to the autosave / resume / beforeunload behavior — those are correct, they were just being masked by this bug.

## Verification

1. Reload the application form, fill Step 1, click Save Progress → toast shows "Progress saved · Step 1 of 9 (...)". A row appears in `applications` with `is_draft = true` and `current_step = 1`.
2. Edit a field, wait 30s → silent autosave succeeds (no toast, console shows no errors, inline "Saved Step X" indicator updates).
3. Advance to Step 4, refresh the tab → form resumes at Step 4 with prior data, "Last saved: Step 4 at ..." line is shown.
4. Submit a completed application → final submit still works and `signed_date` is stored as a real date.
5. Direct RPC repro (`curl ... /rpc/save_application_draft` with the original payload) now returns `[{ id, current_step }]` instead of the `42804` error.

## Technical notes

- Files touched: one new migration for the RPC body, `src/components/application/types.ts`, `src/components/application/utils.ts`, `src/components/application/Step9Signature.tsx` (display only), `src/pages/ApplicationForm.tsx` (error formatting only).
- No changes to RLS, grants, table schema, or the submitted-application / revisions flow.
- The "loud failure" principle from `mem://arch/error-handling/database-updates` is restored: applicants and the console both see the real Postgres error message going forward.
