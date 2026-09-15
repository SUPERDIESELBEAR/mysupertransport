# Pass — recording the 2026-09-15 invite fix in the status document (2026-09-15 17:13 UTC)

Mode: BUILD — DOCUMENTATION ONLY. Immutable record per the standing pass-report rule.

## 1. Scope

The 2026-09-15 16:55 pass (`docs/passes/2026-09-15-1655-invite-role-tenancy-repair.md`)
repaired the three invite functions and committed its report. This pass records that work
in `docs/tms-build-status.md` — nothing else. **No code, no migrations, no tests were
changed.** Files touched:

- `docs/tms-build-status.md` — new section "2026-09-15 (later) — Invite role tenancy:
  the defect was real, the damage was not".
- `docs/passes/2026-09-15-1713-invite-tenancy-record.md` — this report.

## 2. The reviewer error, corrected in the record

The brief for the 16:55 pass asserted "anyone invited since `user_roles` gained its stamp
on 2026-09-13 has an account with no role." Live data refuted it before any edit: zero
profiles created in the window, zero `user_roles` rows, zero NULL-company role rows, one
`invite_resent` audit event (which writes no role). **NOBODY WAS AFFECTED.** The defect
was real and latent — the next invite would have failed silently — but it never fired.

## 3. The eighth instance — a new shape of the source-citation pattern

Recorded in the status document with the count updated (the seventh was the `email_templates`
flag, 2026-09-14). The five earlier instances were false present-tense claims; the sixth
and seventh were inverted (decisions that never entered the record). The eighth is a
past-tense shape: **damage inferred from a code defect without querying whether the path
had been exercised since the defect was introduced.** A defect proves what CAN happen,
not what HAS.

The guard, restated with its new arm:

- A claim about current state must name the query or file it came from.
- A decision taken in conversation is not taken until it is written down.
- **A claim about what HAS HAPPENED is a claim about data, and must come from a query.**

## 4. What the status document now records

- The defect: all three invite functions upserted `user_roles` from a service-role client
  with no `company_id` (42501 from `stamp_tenant_company_id`) and none checked the error.
- The fix: all three resolve the company via `companyIdForUser()` before any user is
  created or mail generated, name `company_id` explicitly, and treat the role write's
  error as fatal.
- Per-path failure behaviour, because they differ: `invite-staff` and `invite-operator`
  send nothing on role-write failure (account without role and without email; retry is
  idempotent); `invite-truck-owner` cannot defer its `inviteUserByEmail` send, so a
  residual DB error leaves ACCOUNT PLUS EMAIL AND NO ROLE — accepted partial completion
  with its reason.
- That no transaction spans these writes (three REST calls plus an auth admin call) and
  that atomicity would need a server-side function, out of scope.
- Verification: `invite-staff` exercised end to end with a scratch address, role landed
  on the right company, scratch user deleted, nothing remains. `invite-operator` and
  `invite-truck-owner` NOT exercised — they would create live records; recorded as
  unverified rather than implied.
- The growth path stays open: `bootstrap-admin`, `invite-staff` and `assign_user_role`
  can mint a staff role for a user with no `company_members` row, who then resolves NULL
  and passes the `has_role` escape for every company. `invite-staff` adding membership is
  a tenancy-semantics change, not a bug fix. TRIGGER: before any further staff invite is
  issued.

## 5. Verification

Documentation-only pass. Confirmed by re-reading the appended section that it renders and
matches the 16:55 pass report and the live probe evidence it cites. No suites and no
typecheck were run — no code changed.

Contradictions with the record: the reviewer's damage assertion (corrected, section 2).
None other.
