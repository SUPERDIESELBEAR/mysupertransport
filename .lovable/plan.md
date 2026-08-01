## Part 1 — Audit of the three tables (finding, no code required)

Every reference in the repo, and who reads it:

| Table | Caller | Role | Status |
|---|---|---|---|
| `application_resume_tokens` | `src/components/management/RevertRevisionModal.tsx` | browser (authenticated) | The only client read. Was the silent-zero consumer; now on the `count_unused_resume_tokens` RPC. |
| `application_resume_tokens` | `request-application-resume`, `request-application-revisions`, `resend-application-link`, `revert-application-revisions` edge functions | service_role | Unaffected — service_role grants intact. |
| `document_short_links` | none directly | — | Reached only via the `get_or_create_short_link` / `resolve_short_link` definer RPCs (`binderShareFormat.ts`, `ShortLinkRedirect.tsx`). Correct shape already. |
| `message_notification_throttle` | `notify-new-message` edge function (4 sites) | service_role | Unaffected. |

Live check confirms `anon` and `authenticated` hold no SELECT/INSERT/UPDATE/DELETE on any of the three. `RevertRevisionModal` was the sole silently-empty surface. Nothing else to fix here.

## Part 2 — Bring `count_unused_resume_tokens` up to the standard

Confirmed against `pg_proc` and migration `20260801012146_...sql`:

- `prosecdef = true`, `anon` EXECUTE revoked, `authenticated` EXECUTE granted — correct.
- `proconfig = {search_path=public, pg_temp}` — **wrong**, convention requires `public, extensions`. `definer-search-path.test.ts` is **red right now** on exactly this function. It will be fixed, not allowlisted.
- Role check is `CASE WHEN EXISTS (...) THEN count ELSE 0 END` — a benign zero for unauthorized callers, i.e. the same silent-empty defect the audit above just chased, baked into the RPC written to replace one.
- Already present in `KNOWN_AUTHENTICATED_EXECUTABLE` (64 entries, max 64) and absent from `KNOWN_ANON_EXECUTABLE` (59/59). Verified correct; no allowlist edit.

### Ordered steps

**Step 1 — Negative control for the widened fail-open rule (before the fix).**
Write the new rule in `definer-fail-open.test.ts` first and prove it fires on the *current* definition:
- Rule: a SECURITY DEFINER body whose authorization predicate (references `user_roles`, `has_role`, `is_staff`, `auth.uid()`, or a session/claim source) sits in a `CASE`/`IF` whose non-matching branch yields a benign value (`0`, `false`, `NULL`, empty result) instead of raising.
- Run the suite and record the failure naming `count_unused_resume_tokens(uuid)` — that output is the control, captured in the doc.
- Also assert the rule against `purge_rods_day`'s fixed shape and the other 100+ resolved definers to confirm it produces no new false positives, exactly as the original heuristic was validated.
- Only after the rule is red for the right reason does the migration land; re-run to show green.

**Step 2 — Confirm 42501 round-trips through PostgREST before committing to it.**
The scheme depends on the SQLSTATE arriving verbatim in `error.code`; only class `P0` has been proven. `42501` is `insufficient_privilege`, a standard class PostgREST may map to an HTTP status and reshape.
- Provoke it for real: a Playwright run signed in as a demo **driver** (non-staff, authenticated), calling `supabase.rpc('count_unused_resume_tokens', ...)`, logging the full error object — `code`, `message`, `details`, `hint`, and the HTTP status.
- Record the verbatim reading in `docs/eld-mail-queue-acl-2026-08-01.md`.
- If `code` arrives as `42501`: the modal keys off it.
- If it is reshaped or dropped: switch the `RAISE EXCEPTION` to a `P0001` code with a stable message token (the class already proven to round-trip) and re-provoke to confirm. Either way the modal only distinguishes "not authorized" from a generic failure on evidence, never on assumption.

**Step 3 — Migration replacing the function.**
`LANGUAGE plpgsql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public, extensions`; positive refuse, coalesce-safe, no `ELSE 0`:

```sql
IF coalesce((SELECT true FROM public.user_roles ur
             WHERE ur.user_id = auth.uid()
               AND ur.role IN ('owner','management','onboarding_staff','dispatcher')
             LIMIT 1), false) THEN
  RETURN (SELECT count(*)::int FROM public.application_resume_tokens t
          WHERE t.application_id = _application_id AND t.used_at IS NULL);
END IF;
RAISE EXCEPTION 'not_authorized' USING ERRCODE = <code chosen in Step 2>;
```

Re-assert `REVOKE ALL ... FROM PUBLIC, anon` and `GRANT EXECUTE ... TO authenticated` so the migration is self-describing.

**Step 4 — `RevertRevisionModal.tsx`.**
Surface the RPC error instead of falling back to 0: on failure show an explicit error state in the "unused resume links" line and keep Confirm disabled, rather than rendering a confident "0". Distinguish not-authorized from generic failure using the code confirmed in Step 2.

### Verification

- `bunx vitest run src/test/definer-search-path.test.ts src/test/definer-fail-open.test.ts src/test/definer-live-catalog.test.ts` — all green, search_path failure gone, no allowlist entry added, max unchanged at 64.
- Re-query `pg_proc` for `proconfig` and both `has_function_privilege` flags.
- Exercise the modal as owner (non-zero count renders) and as a demo driver (loud refusal, not a zero).
- Append to §8 of `docs/eld-mail-queue-acl-2026-08-01.md`: the replacement RPC shipped with the exact defect the section documents, the guard was blind to the `CASE` form, the recorded before/after output of the new rule, and the verbatim PostgREST error reading for the chosen SQLSTATE.
