# Demo carrier — stage 3, pass 3e of 5: company_id NOT NULL, the fixtures, and the stage record

2026-09-23, ~17:45 UTC. BUILD MODE. Two migrations, one new test file, one tightened assertion,
five app files, one new helper, three doc files. No second carrier committed; no real row changed.
The prompt arrived complete (last line: "END OF PROMPT. If this line is not the last thing you
received, STOP…").

---

## Step 1 — counted first, live, before any change

| table | rows | NULL company_id |
|---|---|---|
| applications | 347 | 0 |
| application_invites | 5 | 0 |
| application_correction_requests | 81 | 0 |
| application_correction_fields | 140 | 0 |
| application_document_history | 12 | 0 |
| application_interview_notes | 2 | 0 |
| application_revision_attachments | 1 | 0 |
| pei_requests | 147 | 0 |
| pei_responses | 16 | 0 |
| pei_accidents | 1 | 0 |
| pei_request_events | 527 | 0 |

Zero NULLs, so no writer was missed by 3b. Nothing backfilled. (The 347/147/81/140 against 3a's
346/144/80/137 are ordinary staff work plus 3d's recorded proof application.)

## Step 2 — NOT NULL

`drizzle/migrations/0054_applications_family_company_not_null.sql` — `ALTER COLUMN company_id SET
NOT NULL` on all eleven. Undo is in the file's comment (`DROP NOT NULL` per table).

`0055_applications_family_company_default_null_marker.sql` — an attempt to keep `company_id`
optional in the generated types via `SET DEFAULT NULL`. **Stated plainly: it is a no-op.** Postgres
stores no default for a bare NULL, so the types still mark the column required. It changes
nothing live and is left in place because applied migrations are not removed.

The real type fix: making the column required broke typecheck at the five browser inserts that
rely on the stamp (AddDriverModal, DocumentSlotRow, RevisionReplyAttachments, OperatorDetailPanel,
StaffPortal). New `src/lib/db/stampedInsert.ts` wraps those rows. Its signature **forbids** a
`company_id` (`company_id?: never`), so browser code still cannot name a carrier; the trigger
fills it. No behaviour change.

## Step 3 — the rule bites twice (transaction that raised, scratch carrier)

With a scratch carrier present, as a caller who resolves to no carrier:

```
STAMP applications 42501: Cannot decide which carrier this public.applications row belongs to:
  2 carriers exist and the caller resolves to none.
STAMP application_invites 42501: Cannot decide which carrier this public.application_invites row
  belongs to: 2 carriers exist and the caller resolves to none.
```

Then, with `stamp_company_id` disabled on both roots inside the same transaction:

```
NOTNULL applications 23502: null value in column "company_id" of relation "applications"
  violates not-null constraint
NOTNULL application_invites 23502: null value in column "company_id" of relation
  "application_invites" violates not-null constraint
```

Triggers re-enabled, then `RAISE EXCEPTION 'PROOF_ROLLBACK…'`. A first attempt ran as `anon` and
never reached the stamp (`42501 permission denied for table` — the grant revoked in 3d), so it
was re-run as a server caller. Residue after: 1 carrier, 347 applications, 0 probe rows.

## Step 4 — the fixtures

No test or fixture inserts rows into any of the eleven tables; every test touching them reads the
live catalog (`apply-link-identity`, `tenancy-resolver`, `resume-token-reuse`,
`definer-live-catalog`). None relied on a NULL carrier, so none needed renaming to USDOT 2309365
(the carrier-picking queries were already switched to it in stage 2).

One assertion had to change and was **tightened, not loosened**: `tenancy-resolver.test.ts`
"applications carries a nullable carrier" expected `attnotnull = false` (the 3a state); it now
expects `true`. New guard `src/test/applications-company-not-null.test.ts`: all eleven columns NOT
NULL, and each table still carries its enabled stamp trigger (`stamp_application_company` on the
two roots, `stamp_child_company_from_parent` on the nine). 2 passed.

## Step 5 — the duplicate-email rule (recorded only, not changed)

```
CREATE UNIQUE INDEX applications_email_non_draft_unique ON public.applications
  USING btree (lower(email)) WHERE (is_draft IS NOT TRUE)
```

**Open owner decision before a second carrier recruits:** today one email can hold only one live
application across ALL carriers. A driver with a live application at SUPERTRANSPORT cannot apply
to carrier B.

## Step 6 — stage 3 closed

Entry written in `docs/tms-build-status.md`; wish list updated (stage 3 COMPLETE, stage 4 next,
decisions owed listed).

## Step 7 — nothing changed for SUPERTRANSPORT (real sign-ins)

| | 3d | 3e |
|---|---|---|
| Marcus — pipeline / driver status / rate-con | 37 / 7 / 3 | 37 / 7 / 3 |
| Marcus — Applications Pending / Archived | 7 / 50 | 7 / 50 |
| Marcus — PEI active / hired / not hired | 2 / 128 / 15 | 2 / 128 / 15 |
| Mae — pipeline / driver status / rate-con | 37 / 7 / 3 | 37 / 7 / 3 |
| Mae — Applications Pending / Archived | 7 / 50 | 7 / 50 |
| Mae — PEI active / hired / not hired | 2 / 128 / 15 | 2 / 128 / 15 |

Review drawer opened as Marcus on Jerrick Clark: PENDING, Overview / Documents / PEI tabs,
personal, address, CDL, background verification, interview notes, employment history, reviewer
notes, Send back / Propose changes / Deny / Archive / Approve & Invite — intact.

Public pages, signed out:

- `/apply` — "SUPERTRANSPORT, LLC", "2309365", "788425" all present.
- `/apply/supertransport` — the same three present.
- `/apply/nope-3e` — none present; "This application link is not valid" shown.

## Tests

Full suite, `--maxWorkers=2`, verbatim:

```
 Test Files  2 failed | 219 passed | 2 skipped (223)
      Tests  3 failed | 2219 passed | 16 skipped (2238)
     Errors  2 errors
   Start at  17:17:46
   Duration  645.27s (transform 8.08s, setup 55.29s, collect 45.09s, tests 837.90s, environment 234.44s, prepare 35.16s)
```

- `tenancy-resolver` "applications carries a nullable carrier" — **real, caused by this pass**
  (it asserted the 3a nullable state). Tightened as above.
- `accessorial-adjustment-schema` ×2 — the familiar pooler `EAUTHQUERY auth_query secret check
  timed out`; the 2 errors are vitest-worker `onTaskUpdate` timeouts in the same window.

Re-run of exactly those two files: `Tests 1 failed | 182 passed (183)` — the one failure a
different accessorial test hitting the same `EAUTHQUERY` timeout; that test alone:
`Tests 1 passed | 56 skipped (57)`. Typecheck (`tsgo --noEmit -p tsconfig.app.json`): clean.

## Deploys

None. No edge function changed — the service-role writers already pass a carrier or rely on the
stamp, which runs before NOT NULL is checked.

## Files this pass authored

- `drizzle/migrations/0054_applications_family_company_not_null.sql`
- `drizzle/migrations/0055_applications_family_company_default_null_marker.sql` (no-op, see Step 2)
- `src/integrations/supabase/types.ts` (regenerated)
- `src/lib/db/stampedInsert.ts` (new)
- `src/components/drivers/AddDriverModal.tsx`
- `src/components/management/DocumentSlotRow.tsx`
- `src/components/management/RevisionReplyAttachments.tsx`
- `src/pages/staff/OperatorDetailPanel.tsx`
- `src/pages/staff/StaffPortal.tsx`
- `src/test/applications-company-not-null.test.ts` (new)
- `src/test/tenancy-resolver.test.ts`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-1745-applications-per-carrier-3e.md`
