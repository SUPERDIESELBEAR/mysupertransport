# PASS — 2026-09-16 19:12 UTC — the owner's follow-up list, added to the wish list

Documentation only. Changed files: `docs/tms-wish-list.md` and this report.
No migration, no code, no data change. Carrier count: 1.

## What the pass did

Added a section near the TOP of `docs/tms-wish-list.md`, titled
"OWNER FOLLOW-UP LIST — before and during the second-carrier demo", with the
owner's requested lead-in, grouped exactly as instructed: RECENTLY CLOSED,
DECIDED NOT BUILT, PREREQUISITES BEFORE A SECOND `carrier_profile` ROW,
OWNER DECISIONS OWED, VERIFICATION GAPS. One line per item, each pointing to
the record entry (date, heading, section) that explains it; no reasoning copied
over. The file's "Last updated" line moved to 2026-09-16.

## Read first, and the contradiction check

Read before writing: `docs/tms-wish-list.md` (whole file), and both record
entries dated 2026-09-16 in `docs/tms-build-status.md`:

- "the unassigned tables, and the second-carrier readiness record"
- "the owner's disposition decision, and the live read-enforcement census"

plus `docs/passes/2026-09-16-1138-unassigned-tables-and-readiness-record.md`,
`docs/passes/2026-09-16-1840-read-enforcement-census.md`,
`docs/passes/2026-09-16-1100-second-carrier-readiness.md`, and
`docs/passes/2026-09-15-2115-b6-group-3-driver-remainder.md` where a line's
pointer reaches beyond the two record entries.

**No contradiction with the record was found.** Every item in the owner's list
was checked against the record before it was written into the wish list. Items
verified, item by item:

- Census figures (148 / 12 / 123 / zero restrictive) — record section (c).
- All three disposition-guard failure branches — missing-list branch in the
  1138 entry, duplicate-list and stale-entry branches in the 1840 entry,
  section (e).
- The 12 per-carrier tables, `driver_documents` joining DEFERRED content
  ("joins the eight, making nine"), `eld_cron_runs` GLOBAL with its noted
  read-policy exposure — record section (a).
- `carrier_profile` INSERT/UPDATE/DELETE role-only, and
  `inspection_program_settings` `USING true` — record section (c), "two
  further defects surfaced".
- `generate-application-pdf`, `send-officer-packet`, `process-eld-escalations`
  reading an arbitrary carrier; `receive-rate-con-email` stopping on
  `soleCompanyId`; no path creating carrier #2 with an owner and a membership —
  readiness record section (b), items 1–5.
- How to close read enforcement (per-policy edit vs one restrictive policy) —
  record section (d).
- The `applications`/PEI cross-carrier tension — readiness record section (e),
  "A tension left unresolved".
- `/apply` hard-coded identity fallback; the nine content tables (the eight
  listed there plus `driver_documents`, now nine DEFERRED); `profiles` staff
  reads — readiness record section (c).
- Verification gaps (no real-session demonstration; deployed-vs-repo parity;
  the `vitest-worker` timeout; the three test tools) — record sections (e)/(f)
  and the 1100 pass report.

## THE OWNER'S MESSAGE WAS TRUNCATED

The instruction ended mid-sentence: "…Flag for correction; give the". The
remainder of that sentence never arrived. The item was recorded with the
substance that was given — the flag that record lines reading "CROSS-CARRIER
ISOLATION REMAINS UNPROVEN" imply the isolation is built when for 123 tables it
is not — and the un-guessed remainder is recorded here as NOT RECEIVED. The
flagged lines live in the 2026-09-15 B5/B6 entries of `docs/tms-build-status.md`
(lines near "CROSS-CARRIER ISOLATION REMAINS UNPROVEN. One carrier exists") and
in `docs/passes/2026-09-15-2115-b6-group-3-driver-remainder.md` (closing
paragraph). The 2026-09-16 census entry already contains the substantive
correction ("The correction this census forces"); what remains is correcting
the older wording itself, which is a record edit and was NOT done in this pass
(only the wish list and this report were in scope).

## Deliberate omissions

- No test-list changes in `src/test/tenancy-resolver.test.ts` — the record says
  the batch that migrates the twelve moves them, and the guard fails until it
  does.
- No corrections to the flagged "CROSS-CARRIER ISOLATION REMAINS UNPROVEN"
  lines — out of scope for this pass.

## Verification

Documentation-only pass: no suites to run. Verified after writing that the new
section sits between the file header and "## PARKED CAPABILITIES", that every
one of the 21 items carries exactly one pointer, and that no item carries
invented reasoning. The wish-list edit was committed before this report was
written; this report is the final change.
