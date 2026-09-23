# Demo carrier, stage 3, pass 3b of 5 — every writer stamps the carrier

Date: 2026-09-23 16:00 UTC
Mode: BUILD. The carrier row was NOT created. No second `carrier_profile` row was committed.
Probe rule honoured: no real application or invite was changed; every probe row was removed and
the residue counted.

## What this pass did

The carrier is now decided **at the moment a row is created**, by the database, for both roots of
the family — `applications` and `application_invites` — and every service-role writer names the
carrier explicitly instead of relying on 3a's backfill.

No policy changed. No `anon` privilege changed. That is 3c.

Migration applied:

- `drizzle/migrations/0045_applications_roots_stamp_company.sql`

Edge functions changed and deployed: `invite-applicant`, `provision-demo-driver`,
`create-test-operator`.

## STEP 0 — any NULLs since 3a?

None. Immediately before this pass: `applications` 346 rows, 0 NULL `company_id`;
`application_invites` 5 rows, 0 NULL. Nothing to stamp, nothing to list. Sole carrier
`6b54d0e6-8743-4284-b55b-8cd094b093dd` (USDOT 2309365).

## STEP 1 — the two roots stamp on INSERT

`public.stamp_application_company()`, SECURITY DEFINER, `search_path` pinned, fires as trigger
`stamp_company_id` BEFORE INSERT on `applications` and on `application_invites`. EXECUTE revoked
from PUBLIC, `anon` and `authenticated`, matching `stamp_tenant_company_id` — only the two
triggers that own it can reach it.

Three cases, in order:

1. **`current_company_id()` resolves** (a signed-in staff member, operator or truck owner):
   the row gets that carrier. A caller-supplied `company_id` that DISAGREES is **REFUSED**
   (42501), not silently overwritten.
2. **`service_role` naming a carrier explicitly:** trusted as given. This is the path the three
   edge functions use.
3. **Anonymous, or a caller whose carrier cannot be resolved, with no carrier supplied:** the
   sole carrier is resolved **while exactly one exists**, and the insert is **REFUSED** (42501)
   the moment there are two or more — the stage 2 pattern, in force until the per-carrier apply
   link (3d) supplies the carrier itself.

**Why case 1 refuses rather than overwrites.** The child tables overwrite, because a child's
carrier is not the caller's business — it is a fact of its parent. A root is different: a
signed-in staff member naming *another* carrier is either a bug or an attempt, and neither should
be absorbed quietly. The stamp for a child derives; the stamp for a root refuses.

## STEP 2 — the writers, and where each gets its carrier

| Writer | Kind | Carrier now comes from |
|---|---|---|
| `save_application_draft` | definer RPC, anonymous | the trigger, case 3 — sole carrier today, refused at two |
| `submit_application_draft` | definer RPC, anonymous | nothing new: it **UPDATEs** the existing draft, so the carrier was already decided when the draft was created |
| `invite-applicant` | edge, service role | `companyIdForUser(admin, callerId)` — the **inviting staff member's** carrier |
| `provision-demo-driver` | edge, service role | `companyIdForUser(admin, userId)` |
| `create-test-operator` | edge, service role | `soleCompanyId(admin)` |
| `StaffApplicationModal` | browser, signed-in staff | the trigger, case 1 — the staff member's own carrier. No code change needed |
| `provision-test-driver` | edge, service role | no change: it only SELECTs and UPDATEs existing applications; it makes no carrier decision |
| `AddDriverModal` | browser | inserts no application; nothing to stamp |

## What this pass found that the design had wrong

The design recorded the family's only anonymous table privilege as **`anon`'s INSERT on
`applications`**, to be revoked in 3c. It is not there. Live grants on `applications` are
`SELECT, INSERT` to `sandbox_exec` only — the read-only harness role — and **nothing at all to
`anon`**. An anonymous POST straight at the table returns `42501 permission denied for table
applications`, proven live during this pass.

The public application therefore already runs entirely through the two definer RPCs, which is the
shape 3c was going to build. 3c's remaining work on the anonymous side is to confirm those two
functions stay the only door and to write the restrictive per-carrier policies — not to revoke a
grant that does not exist.

## STEP 3 — every entry path stamps

All paths stamped `6b54d0e6-8743-4284-b55b-8cd094b093dd`.

| Path | Result |
|---|---|
| A anonymous `/apply` draft via `save_application_draft` | SUPERTRANSPORT |
| B submit via `submit_application_draft` | SUPERTRANSPORT, unchanged from the draft |
| C `invite-applicant` | SUPERTRANSPORT, from the inviting staff member |
| D staff-created application (the modal's payload) | SUPERTRANSPORT, from the staff member |
| E `provision-demo-driver` | SUPERTRANSPORT |
| F `create-test-operator` | SUPERTRANSPORT |

Then, inside a transaction that ended by RAISING, with a scratch carrier present so that two
carriers existed for the length of the probe:

- **G1** an anonymous insert with no carrier: **REFUSED**.
- **G2** a staff member of the scratch carrier creating an application: got the **scratch**
  carrier, not SUPERTRANSPORT's.
- **G3** that same staff member naming SUPERTRANSPORT's carrier: **REFUSED**, 42501.
- **G4** an invite by that staff member: the **scratch** carrier.

Because `supabase--run_sql` cannot return `NOTICE` output, each finding was accumulated into a
text variable and the transaction was aborted by raising *with the findings embedded in the
message* — the proof and the rollback are the same statement.

**Harness limits, recorded so the next pass does not re-discover them.** In `psql` the sandbox
role cannot `set_config('role','anon')`, cannot EXECUTE `submit_application_draft`, and cannot
UPDATE `applications`; `carrier_profile` requires `legal_name`, `usdot_number`, `mc_number`,
`main_office_address`, `home_terminal_address` and `home_terminal_timezone`; and every `profiles`
row resolves to SUPERTRANSPORT, so there is no unattached identity to borrow. The two-carrier
half of the proof therefore ran through `supabase--run_sql`, not `psql`.

## STEP 4 — nothing changed for SUPERTRANSPORT

One real sign-in per identity, sessions minted per account.

| Check | Marcus (owner) | Mae (management) | Onboarding-only |
|---|---|---|---|
| Pipeline | 37 / dispatch 7 / rate-con 3 | same | 37, its only landing screen |
| Applications | Pending 7, Archived 50 | Pending 7, Archived 50 | no Applications screen — `?view=applications` lands on the pipeline |
| PEI queue | 2 active, 0 awaiting, 0 overdue, 128 hired, 15 not hired | same | same |
| Review drawer | Jerrick Clark opens: Overview / Documents / PEI, signature, SSN reveal, uploaded documents, reviewer notes, correction and approval actions | same | n/a |

Three figures differ from 3a's, and none of them is this pass: PEI requests 144 → **147**,
correction requests 80 → **81**, correction fields 137 → **140**, and the PEI queue's active
count 1 → **2**, all from ordinary staff work in the intervening two hours. Applications is
unchanged at 346.

Family-wide, immediately after the migration: 346 / 5 / 81 / 140 / 12 / 2 / 1 / 147 / 16 / 1 /
527 rows, **0 NULL carrier in all eleven tables**.

### /apply end to end, by a throwaway applicant

`/apply` was loaded with no session and renders fully (9 steps, FMCSA notice, save-progress).
A throwaway applicant was then driven through the real public path — `save_application_draft`
then `submit_application_draft`, called with the `anon` key exactly as the page calls them —
producing application `34b1eb77…`, `review_status = pending`, carrier
`6b54d0e6-8743-4284-b55b-8cd094b093dd`. It created no PEI request, no resume token and no
document history.

Removed afterwards. **Residue: 346 applications, 0 NULL carrier, 0 rows matching the probe
email, 1 carrier.** Zero.

## Decision owed later, not now

**One live application per email, across ALL carriers.**
`applications_email_non_draft_unique` carries no carrier, so today a person who holds a live
application at SUPERTRANSPORT cannot file one at another carrier — the second insert fails on a
uniqueness rule that mentions no company. Whether that is correct (one candidate, one carrier at
a time) or wrong (each carrier's hiring is its own business) is the owner's call. It does not
block 3c, 3d or 3e; it must be settled before a second carrier recruits.

## Tests

Full suite, `--maxWorkers=2`, summary verbatim:

```
 Test Files  3 failed | 216 passed | 2 skipped (221)
      Tests  3 failed | 2209 passed | 16 skipped (2228)
   Duration  788.34s (transform 10.16s, setup 101.13s, collect 67.99s, tests 834.18s, environment 400.94s, prepare 60.48s)
```

All three failures are the familiar pooler timeout — `FATAL: (EAUTHQUERY) auth_query secret
check timed out` — in `billing-schema`, `dispatch-settlement-schema` and
`passthroughDriverList`, none of them touched by this pass. Re-run of exactly those three files:
**3 files, 82 tests, all passed.** The two unhandled `onTaskUpdate` timeouts are the same
reporter symptom of the same slow connection.

Type check: clean.

## Deploys and how each was confirmed

| Function | Confirmed |
|---|---|
| `invite-applicant` | live: `401 {"error":"Unauthorized"}` — its own auth guard, reached, so the module and its new `_shared/tenancy.ts` import boot cleanly |
| `provision-demo-driver` | live: `401 {"error":"Unauthorized: missing bearer token"}` |
| `create-test-operator` | live: `503 {"error":"Not configured"}` — its own bootstrap-secret guard, reached |

A broken import would have produced a boot error, not the function's own refusal.

## Files this pass authored

- `drizzle/migrations/0045_applications_roots_stamp_company.sql`
- `supabase/functions/invite-applicant/index.ts`
- `supabase/functions/provision-demo-driver/index.ts`
- `supabase/functions/create-test-operator/index.ts`
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-1600-applications-per-carrier-3b.md`

## Next

Pass **3c — restrictive policies**: per-table tenant isolation across all eleven tables, the two
anonymous RPCs confirmed as the only public door, and `PENDING_RESTRICTIVE` emptied.
