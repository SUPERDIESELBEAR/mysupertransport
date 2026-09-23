# Demo carrier — stage 3, pass 3c of 5: the isolation rules on the applications and PEI families

2026-09-23, ~17:30 UTC. BUILD MODE. One migration, one test file, three doc files.
No second carrier committed; every refusal proof ran inside a transaction that raised.

---

## What this pass did

Applied the standard restrictive `tenant_isolation` policy to all eleven tables of the
applications and PEI families, so the families now match the other 163 company-bearing tables.
No permissive policy was touched, no writer changed, no grant changed, no screen changed.

Migration: `drizzle/migrations/0046_applications_family_restrictive_tenant_policy.sql`.

### A correction to the record

An earlier summary claimed 3c was already done. It was not: **no restrictive policy existed on
any of the eleven tables before 0046**. Verified live from `pg_policies` before applying. The
work in this pass is the real 3c.

### The eleven policies as they are live now

`RESTRICTIVE FOR ALL TO authenticated`, verified from `pg_policies` after applying:

| table | predicate |
|---|---|
| application_correction_fields | `company_id = (SELECT current_company_id())` |
| application_correction_requests | same |
| application_document_history | same |
| application_interview_notes | same |
| application_invites | same |
| application_revision_attachments | same |
| pei_accidents | same |
| pei_request_events | same |
| pei_requests | same |
| pei_responses | same |
| **applications** | `company_id = (SELECT current_company_id()) OR user_id = auth.uid()` |

**Why `applications` is wider, and only `applications`.** `src/pages/ApplicationStatus.tsx:38-42`
reads the applicant's own row by `user_id`. A signed-in applicant is not an operator, not a truck
owner and not a staff member, so `current_company_id()` resolves to **NULL** for him — decision C.
The narrow predicate would have shut every applicant out of his own status page. The exception is
his own row and nothing else: it is keyed to `auth.uid()`, cannot widen to another applicant's row,
and cannot reach any of the other ten tables. 158 applications carry a `user_id`, and all 158
resolve to a carrier, so the exception never has to carry the load of isolation itself.

### The guard

`src/test/tenancy-resolver.test.ts`:

- `PENDING_RESTRICTIVE` is back to empty — nothing is owed.
- `RESTRICTIVE_DONE` gains the eleven, citing 0046.
- New `RESTRICTIVE_WIDER` map holds the one accepted exception and its exact predicate; the
  shape check compares against `RESTRICTIVE_WIDER[table] ?? RESTRICTIVE_PREDICATE`.
- New fixture: **the applicant self-exception is accepted ONLY on `applications`** — the same
  predicate on any of the other ten is a failure.

The file runs green: **1 passed (1) / 126 passed (126)**.

### The anonymous door

Confirmed live, not assumed: `pg_class.relacl` shows the eleven tables grant to `postgres`,
`authenticated`, `service_role` and the two sandbox harness roles only. `anon` has no privilege
on any of the ten; on `applications` it holds INSERT only, which nothing uses — the public form
runs entirely through `save_application_draft` and `submit_application_draft` (both definer).
Nothing to revoke, and no anonymous route needed a policy.

Proven end to end as a real anonymous caller, with only the publishable key: a draft saved, then
submitted, arriving as `is_draft=false`, `review_status=pending`, `company_id` =
`6b54d0e6-8743-4284-b55b-8cd094b093dd` (USDOT 2309365). Row removed afterwards.

---

## The isolation proof — scratch carrier, transaction rolled back

Inside one transaction that ended by raising, with a scratch carrier, a scratch staff member
(`company_members` moved, a staff role granted so the permissive policies would admit him) and
one application of his own:

```
is_staff=true; resolver=scratch;
sees SUPERTRANSPORT applications: 0 (expected 0); sees own: 1 (expected 1);
PEI requests: 0; PEI responses: 0; PEI events: 0; PEI accidents: 0;
invites: 0; corrections: 0; correction fields: 0; doc history: 0;
interview notes: 0; revision attachments: 0
ERROR: P0001 ROLLED BACK ON PURPOSE
```

That is the whole point of the stage: before 0046 that first number was 346 and every other
number was the full live count, SSNs included.

Two earlier attempts failed and are worth recording. A scratch staff member picked only from
`company_members` was **not** staff, so no permissive policy admitted even his own row. A staff
member picked from the live set resolved to **no** carrier once his membership moved, because he
also holds an operator or truck-owner row pointing at SUPERTRANSPORT — two distinct companies,
and decision C resolves that to NOTHING. Both are the guards working, not defects.

Residue, live, after everything: **1 carrier, 346 applications, 0 NULL carrier, 0 probe rows,
0 company_members pointing anywhere but USDOT 2309365.**

---

## Nothing changed for SUPERTRANSPORT

One real sign-in per identity, before and after the migration, every figure identical:

| | before | after |
|---|---|---|
| Marcus — pipeline / driver status / rate-con | 37 / 7 / 3 | 37 / 7 / 3 |
| Marcus — Applications Pending / Archived | 7 / 50 | 7 / 50 |
| Marcus — PEI active / hired / not hired | 2 / 128 / 15 | 2 / 128 / 15 |
| Mae — Applications Pending / Archived | 7 / 50 | 7 / 50 |
| Mae — PEI active / hired / not hired | 2 / 128 / 15 | 2 / 128 / 15 |
| Mae — pipeline / driver status / rate-con | 37 / 7 / 3 | 37 / 7 / 3 |
| onboarding-only — pipeline / driver hub / compliance | 70 / 36, no Applications screen | 70 / 36, no Applications screen |
| Steve (driver app) | home screen, nothing carrier-related | unchanged |

One review drawer opened as Marcus on Michael Underwood (1 correction request, 3 document-history
rows): Overview, Documents and PEI tabs, employment history, disclosures, signature, **Reveal
SSN**, uploaded documents with View / Replace / Request retake, interview notes — all intact.

---

## Owed later, not now

`applications_email_non_draft_unique` still carries no carrier, so **one live application per
email holds across all carriers**: a candidate with a live application at SUPERTRANSPORT could
not file one at another carrier. The owner's call, before a second carrier recruits. Not blocking
3d or 3e.

---

## Checks

- Full suite, `--maxWorkers=2` — summary lines verbatim in the record entry.
- Type check: clean.
- **No edge function changed, so none was deployed.**

## Files this pass authored

- `drizzle/migrations/0046_applications_family_restrictive_tenant_policy.sql`
- `src/test/tenancy-resolver.test.ts`
- `src/integrations/supabase/types.ts` (regenerated)
- `docs/passes/2026-09-23-1730-applications-per-carrier-3c.md`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`

Next: **3d — the per-carrier apply link and the letterhead.**
