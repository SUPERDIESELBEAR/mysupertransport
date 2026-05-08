# Fix: "Request Revisions" returns red error toast

## Root cause
The `request-application-revisions` edge function source exists in the repo and is registered in `supabase/config.toml`, but it was never deployed to Lovable Cloud. A direct call returns:

```
404 NOT_FOUND — "Requested function was not found"
```

That's why staff see a red error the moment they click **Send to applicant** — the client invoke fails before any business logic runs. No code or schema change is needed; the function code itself is correct (auth via `getClaims`, multi-role check, status validation, audit notes, resume token, branded email).

## Fix
Deploy the existing edge function:

- `request-application-revisions`

While we're at it, redeploy `invite-operator` too, since the recent re-approval/`skip_invite` changes rely on the latest version being live.

## Verification
1. Re-call the function via the test tool — expect `401 unauthorized` (instead of `404`), confirming it's live.
2. From Management Portal → Applications, open an applicant, click **Request Revisions**, enter a message, and click **Send to applicant** — expect the green "Revision request emailed to …" toast and the applicant's status to flip to `revisions_requested`.
3. Confirm the email arrives with the secure 7-day resume link.

## Notes
- No DB migration needed — `pre_revision_status` column and enum values are already in place.
- No frontend change needed.
