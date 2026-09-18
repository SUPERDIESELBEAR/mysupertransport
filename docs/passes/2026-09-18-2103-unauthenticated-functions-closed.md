# Pass report — the eight "no caller required" functions: STOPPED, premise contradicted

2026-09-18 2103 UTC. BUILD MODE. The prompt's final line (`END OF PROMPT…`)
arrived intact; the prompt was not truncated.

**Nothing was changed by this pass.** The prompt's instruction was: "If anything
below CONTRADICTS the live system or the record, STOP AND REPORT." It does. All
eight functions already require an authenticated caller, and seven of the eight
already require a named staff role. There is no exposure to close.

Read first, as instructed: `docs/passes/2026-09-18-2030-owner-only-delete.md`
(Step 5, the queue, and the `get-staff-list` fix it applied) and decisions **P1**,
**P6**, **P7**, **P8**.

## The contradiction, in the code

Each of the eight calls a gate on its first line of work. `requireStaff`
(`supabase/functions/_shared/email/auth.ts:88-140`) reads the `Authorization`
header, returns **401** if there is no bearer token, **401** if `getClaims`
rejects it, then queries `user_roles` with the service client and returns **403**
if the caller holds none of the named roles. `requireAuthedUser`
(same file, `:146-169`) is the weaker variant: valid JWT required, no role test.

| Function | Gate in the live code | Roles required |
|---|---|---|
| `purge-rods-day` | `requireStaff` (`index.ts:25`) | management, owner |
| `sweep-rods-orphans` | `requireStaff` (`index.ts:47`) | management, owner |
| `delete-osas-sheet` | `requireStaff` (`index.ts:13`) | management, onboarding_staff, owner |
| `file-executed-ica` | `requireAuthedUser` (`index.ts:28`) + signer-identity check | any signed-in user, then must BE the driver or the linked truck owner for that unit |
| `set-demo-flag` | `requireStaff` (`index.ts:9`) | management, owner |
| `send-ica-review-link` | `requireStaff` (`index.ts:16`) | management, onboarding_staff, owner, dispatcher |
| `send-equipment-return-instructions` | `requireStaff` (`index.ts:31`) | management, onboarding_staff, owner |
| `send-osas-to-operator` | `requireStaff` (`index.ts:58`) | management, onboarding_staff, owner |

None of the eight is scheduled. No `pg_cron` job and no `CRON_SECRET` path
appears in any of them, so the "scheduled job → shared secret" branch of Step 1
applies to none of them. (`purge-deleted-operator-documents`, the ninth name on
that queue line, is the one that does carry an `x-cron-secret` / `CRON_SECRET`
check — `index.ts:9,16,20` — and it was already recorded as "a cron secret
exists, but a session reaches it too". It is untouched and stays in the queue.)

## The live proof — every one of the eight refuses an unauthenticated call

Called with the publishable key and **no session**, from outside any signed-in
context, `POST /functions/v1/<name>` with body `{}`:

```
purge-rods-day                      -> 401 {"error":"Unauthorized: missing bearer token","status":401}
sweep-rods-orphans                  -> 401 {"error":"Unauthorized: missing bearer token","status":401}
delete-osas-sheet                   -> 401 {"error":"Unauthorized: missing bearer token","status":401}
file-executed-ica                   -> 401 {"error":"Unauthorized: missing bearer token","status":401}
set-demo-flag                       -> 401 {"error":"Unauthorized: missing bearer token","status":401}
send-ica-review-link                -> 401 {"error":"Unauthorized: missing bearer token","status":401}
send-equipment-return-instructions   -> 401 {"error":"Unauthorized: missing bearer token","status":401}
send-osas-to-operator               -> 401 {"error":"Unauthorized: missing bearer token","status":401}
```

The mail ones never reach the point of sending: the gate returns before the body
is read, so **no mail was sent and no target had to be made safe**. The
destructive ones never reach a row, so **no probe row was created** — Steps 2 and
5 had nothing to do, and no cleanup is owed. Nothing was created, so nothing
remains.

## Why the 2030 queue said otherwise

The 2030 pass's Step 5 method was: grep each function for `'role'`, `has_role`
and `is_staff`, then check the survivors for whether they read `Authorization`.
`requireStaff` satisfies all of that — but *inside the shared helper*, not inside
the function file. The grep did not follow the import. So the eight were
mis-filed: the method found no literal role string in the function's own text and
concluded there was no check, when in fact the check is one call away and is
stricter than most.

This does **not** change the 2030 pass's own finding or its fix. `get-staff-list`
genuinely had no owner test on its `delete_user` branch — that was demonstrated
on live infrastructure before and after the fix, not inferred from a grep — and it
remains closed.

## What is still owed

The fifteen "any signed-in session" functions on that queue line were **not**
re-checked by this pass. The same method produced them, so the same false
positive is possible among them; each needs the import followed before anything
is built or dismissed. That is the next pass.

## Steps not run, and why

- **Steps 3 and 4 (fix and verify each fix):** nothing to fix.
- **Step 5 (cleanup):** nothing was created.
- **Step 7 (full suite, typecheck, deploy):** no function was changed, so no
  deployment and no suite run. The standing rule ties the suite to a code change;
  this pass authored documentation only. Stated plainly rather than run for show.

## Files this pass authored

The platform commits each change as it is made; `git commit` is not available to
the agent.

- `docs/passes/2026-09-18-2103-unauthenticated-functions-closed.md` (this report)
- `docs/tms-wish-list.md` (the queue line corrected)
- `docs/tms-build-status.md` (dated entry)
