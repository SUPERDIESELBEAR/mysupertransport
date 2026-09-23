# Demo carrier, stage 3, pass 3a of 5 — the carrier column and the backfill

Date: 2026-09-23 14:20 UTC
Mode: BUILD. The carrier row was NOT created. No second `carrier_profile` row was committed.

## What this pass did

Added a **nullable** `company_id uuid REFERENCES carrier_profile(id) ON DELETE RESTRICT` to the
eleven tables of the applications and PEI families, backfilled every existing row from the sole
carrier (USDOT 2309365, `6b54d0e6-8743-4284-b55b-8cd094b093dd`), and gave the nine child tables a
trigger that derives their carrier from their parent.

It changed **no policy, no definer function, no edge function, no screen and not the `anon`
INSERT grant**. Those are passes 3b and 3c.

Migrations applied:

- `drizzle/migrations/0043_applications_family_company_column.sql`
- `drizzle/migrations/0044_revoke_stamp_child_company_execute.sql`

## STEP 1 — the two roots

| Table | Rows | Expected | NULL after |
|---|---|---|---|
| `applications` | 346 | 346 | 0 |
| `application_invites` | 5 | 5 | 0 |

## STEP 2 — the nine children

Each has the same nullable column plus a BEFORE INSERT OR UPDATE trigger,
`public.stamp_child_company_from_parent()`, which reads the parent row and **overwrites**
whatever carrier the caller supplied.

| Table | Rows | Expected | NULL after | Parent |
|---|---|---|---|---|
| `application_correction_requests` | 80 | 80 | 0 | `applications` |
| `application_correction_fields` | 137 | 137 | 0 | correction request → application |
| `application_document_history` | 12 | 12 | 0 | `applications` |
| `application_interview_notes` | 2 | 2 | 0 | `applications` |
| `application_revision_attachments` | 1 | 1 | 0 | `applications` |
| `pei_requests` | 144 | 144 | 0 | `applications` |
| `pei_responses` | 16 | 16 | 0 | PEI request → application |
| `pei_accidents` | 1 | 1 | 0 | PEI response → request |
| `pei_request_events` | 527 | 527 | 0 | PEI request → application |

Every count matched the prompt exactly. No row failed to derive a carrier, so nothing was left
NULL and there was nothing to stop and report.

### Why the backfill disabled the triggers, and what that did not do

The first attempt failed loudly, and correctly: `application_document_history` is append-only —
`enforce_application_document_history_append_only()` raises `application_document_history is
append-only` on any UPDATE. Four other tables in the family carry triggers that would have
logged spurious correction/attachment events or re-derived PEI deadlines and statuses from an
UPDATE whose only purpose was filling a new column.

The migration therefore runs in this order: create the columns → create the stamping triggers →
`ALTER TABLE ... DISABLE TRIGGER USER` on all eleven → backfill parents, then children through
their joins → re-enable every trigger → create the indexes. **No guard was dropped, relaxed or
rewritten**, and every trigger is live again at the end.

## STEP 3 — nothing else

Confirmed untouched: all policies on the family, every definer function that reads or writes it,
every edge function, every screen, and `anon`'s INSERT grant on `applications`. The
duplicate-email index `applications_email_non_draft_unique` remains GLOBAL — whether one person
may hold a live application at two carriers is a separate decision, not 3a's to make.

One follow-up migration was required by the standing security guards: `0044` revokes EXECUTE on
`stamp_child_company_from_parent()` from PUBLIC, `anon` and `authenticated`, so its grants match
`stamp_tenant_company_id` — reachable only by the triggers that own it.

## STEP 4 — the derivation bites

Run inside a `DO` block that inserted a scratch carrier, inserted children naming **that**
carrier while their parents belong to SUPERTRANSPORT, read the stored value back, and then
**raised** so the transaction rolled back.

- correction request: supplied scratch carrier, stored = parent application's carrier
- PEI response: supplied scratch carrier, stored = parent request's carrier
- PEI request event: supplied scratch carrier, stored = parent request's carrier

Residue after the rollback: 1 carrier, 0 scratch rows of any kind, 346 applications, 144 PEI
requests, 0 unexpired resume tokens. Zero.

## STEP 5 — nothing changed for SUPERTRANSPORT

Real sessions, one sign-in per identity, before and after the migration. Both sides identical.

| Check | Marcus (owner) | Mae (management) | Onboarding-only |
|---|---|---|---|
| Pipeline | 37 / dispatch 7 / rate-con 3 | same | 37 (its only screen) |
| PEI queue | 144 (1 active, 128 hired, 15 not hired) | same | same |
| Applications list | Pending 7, Archived 50, 276 shown | same | no Applications nav — redirects to the pipeline |

One application opened in the review drawer (Robert Francis, approved): Overview, Documents and
PEI tabs all render; Documents shows the FCRA, PSP, DOT Drug & Alcohol and Certificate of
Receipt PDFs plus Reviewer Notes; the PEI panel shows all three §391.23 employers; the
correction and document-history panels are intact.

The onboarding-only login has no Applications screen at all, so its proof is the pipeline and
the PEI queue.

Console errors seen are the pre-existing React `forwardRef` warnings, unrelated to this pass.

## STEP 6 — the resume window

`application_resume_tokens`: 56 rows total, **0 unexpired** immediately before the migration and
**0 unexpired** immediately after. No applicant's emailed link could break, and the 24-hour
expiry keeps that true.

## Test guard updates

Five test assertions were written against the old declaration that applications is GLOBAL. They
were updated to the owner's decision, not silenced:

- `applications is still GLOBAL` → **`applications carries a nullable carrier, and its email rule
  is untouched`**: asserts the column exists and is nullable, and that the email index still
  carries no carrier.
- `GLOBAL_TABLES` 19 → **12**, with a comment recording that the seven application tables left by
  being STAMPED on the 2026-09-23 decision, superseding 2026-09-13.
- `AWAITING_APPLICATIONS` (the four PEI tables) **retired** — same reason.
- `PENDING_RESTRICTIVE` now declares all **eleven** tables, so they are visibly awaiting 3c
  rather than silently undisposed.
- the DONE-list floor counts **DONE + PENDING** against the live inventory, which is what the
  original assertion meant before the pending list was empty.

## Deploys

**None.** No edge function changed in this pass.

## Files this pass authored

- `drizzle/migrations/0043_applications_family_company_column.sql`
- `drizzle/migrations/0044_revoke_stamp_child_company_execute.sql`
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- `src/test/tenancy-resolver.test.ts`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-1420-applications-per-carrier-3a.md`

## Next

Pass **3b — writers stamp**: every writer of `applications` and `application_invites` supplies
the carrier explicitly instead of relying on the backfill.
