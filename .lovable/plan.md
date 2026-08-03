# Applicant document uploads fail: "permission denied for table operators"

## What's actually happening (verified against the live database)

The applicant upload itself is configured correctly. The bucket policy that should let a draft applicant upload exists and is fine:

- `Applicants upload docs under their own draft token` — INSERT, roles `{anon, authenticated}`, checks `is_valid_application_draft_token(...)` (SECURITY DEFINER, so it does not need table grants).

The failure comes from a *different, unrelated* policy on the same table. Postgres evaluates **every** permissive INSERT policy that applies to the caller's role, not just the one that would allow the row. This policy applies to role `public`, which includes `anon`:

- `Operators can upload pay setup docs` — INSERT, roles `{public}`, body contains `EXISTS (SELECT 1 FROM operators WHERE ...)`.

And the live ACL on `public.operators` is:

```text
postgres, authenticated, service_role   (no anon, no PUBLIC)
```

So when a not-signed-in applicant inserts into `storage.objects`, the planner initializes that pay-setup policy's subplan against `public.operators`, `anon` has no privilege on it, and the whole statement aborts with `permission denied for table operators` — before the applicant's own draft-token policy ever gets a chance to allow the row. That is exactly the red text in the screenshot under "Front of Driver's License", and it will hit every uploader on Step 7 (DL front, DL rear, medical card) identically.

The same shape exists on other commands for anonymous callers (not the reported bug, but the same latent defect):

- `Operators can update their pay setup docs` — UPDATE, roles `{public}`, reads `operators`
- `Operators can view own fleet documents` — SELECT, roles `{public}`, reads `operators`

## The fix

A migration that re-creates the offending policies scoped to `authenticated` instead of `public`. Nothing about the policy logic changes — every one of them already requires `auth.uid()` to match an operator row, so they can never grant anything to an anonymous caller. Restricting the role is purely removing dead surface that anon is forced to evaluate.

1. `DROP POLICY` / `CREATE POLICY ... TO authenticated` for:
   - `Operators can upload pay setup docs` (the reported break)
   - `Operators can update their pay setup docs`
   - `Operators can view own fleet documents`
2. Leave the staff `is_staff(auth.uid())` policies alone — `is_staff` is SECURITY DEFINER and needs no grants, so it is safe under `public`.

## Verification

- Re-read `pg_policies` for `storage.objects` and confirm no policy reachable by `anon` dereferences a table `anon` cannot read.
- Drive the live app with Playwright as a signed-out applicant: open the application form, reach Step 7, upload a test image to Front of Driver's License, and assert the green "File uploaded successfully" state instead of the red error. Repeat for Medical Certificate.
- Sanity-check that an authenticated operator can still upload a pay-setup document and view fleet documents, so the role narrowing didn't regress those paths.

## Notes

- No frontend changes are needed; `Step7Documents.tsx` and `uploadWithAuth.ts` are surfacing the database error correctly.
- Existing applicants who hit this can retry immediately once the migration applies — nothing was written half-way, the insert aborted.
