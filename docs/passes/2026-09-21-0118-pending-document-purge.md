# 2026-09-21 01:18 UTC — the twelve documents due for permanent purge tonight

Read-only pass. No code, no migrations, no data changes, no deletions. **Full suite
deliberately skipped — this pass is docs only.**

Follows `docs/passes/2026-09-21-0105-cron-secret-repair.md`, Step 5: job 15
(`purge-deleted-operator-documents`) runs at 03:15 UTC and permanently removes
`operator_documents` rows soft-deleted more than 30 days ago, storage object first.

**No contradiction with the live system.** Live count at 2026-09-21 01:18 UTC:
18 soft-deleted rows exist, exactly **12** are past the 30-day cutoff
(`deleted_at < now() - interval '30 days'`, i.e. before 2026-08-22 01:18 UTC). The
other 6 (deleted 2026-08-25 → 2026-09-01) are not yet eligible and survive tonight.

## Sources used

| Answer | Source |
| --- | --- |
| type, file name, upload date, soft-delete date | `operator_documents.document_type / file_name / uploaded_at / deleted_at` |
| who deleted it | `operator_documents.deleted_by` (uuid) → `profiles.user_id` for the name; independently corroborated by `audit_log` rows `action = 'document_deleted'`, `actor_name` |
| reason | `operator_documents.delete_reason` — **NULL on all twelve**; no reason was recorded |
| operator name | `operators.application_id` → `applications.first_name / last_name` |
| active / terminated | `operators.is_active`, `operators.deactivated_at` |
| newer same-type doc | count of live `operator_documents` rows, same operator, same type, `uploaded_at` later |

Both sources agree on all twelve: same file names, same timestamps, same actor. The
deleter is recorded — nothing is guessed.

## STEP 1 + STEP 2 — the twelve

| # | Type | File name | Operator | Operator state | Uploaded | Soft-deleted (UTC) | Deleted by | Newer same-type doc? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | other | 1780497056730915741476265045688.jpg | Robert Sargent | active | 2026-06-03 | 2026-06-11 17:33 | Mae Lauron | **no** |
| 2 | form_2290 | 17804969833482669986847864158151.jpg | Robert Sargent | active | 2026-06-03 | 2026-06-11 17:33 | Mae Lauron | yes (2) |
| 3 | truck_title | GD298068.pdf | Trovino Huddleston | active | 2026-06-11 | 2026-06-11 20:28 | Mae Lauron | yes (2) |
| 4 | other | image.jpg | Ian Dunfee | active | 2026-06-09 | 2026-06-11 20:40 | Mae Lauron | yes (2) |
| 5 | registration | IMG_8789.jpeg | Robert Francis | active | 2026-07-14 | 2026-07-17 15:11 | Mae Lauron | yes (1) |
| 6 | registration | 300 Add Transfer Invoice.pdf | Ali Mohamed | active | 2026-07-21 | 2026-07-23 16:57 | Mae Lauron | yes (1) |
| 7 | registration | 260 Add Transfer Invoice.pdf | Ali Mohamed | active | 2026-07-23 | 2026-07-23 17:04 | Mae Lauron | yes (1) |
| 8 | registration | 260 Add Transfer Invoice.pdf (duplicate upload) | Ali Mohamed | active | 2026-07-23 | 2026-07-23 17:04 | Mae Lauron | yes (1) |
| 9 | registration | 260 Add Transfer Final invoice.pdf | Ali Mohamed | active | 2026-07-23 | 2026-07-23 17:04 | Mae Lauron | yes (1) |
| 10 | form_2290 | 300 Schedule 1 - 2290 receipt.pdf | Ali Mohamed | active | 2026-07-21 | 2026-07-23 17:09 | Mae Lauron | yes (2) |
| 11 | form_2290 | 300 Schedule 1 - 2290.pdf | Ali Mohamed | active | 2026-07-21 | 2026-07-23 17:10 | Mae Lauron | yes (2) |
| 12 | registration | 301 Add Transfer Invoice.pdf | Danny Goodwin | active | 2026-07-22 | 2026-07-23 17:14 | Mae Lauron | yes (1) |

Composition: 6 `registration`, 3 `form_2290`, 1 `truck_title`, 2 `other` — matches the
0105 report exactly.

All twelve belong to **seven active operators** (`is_active = true`, `deactivated_at`
NULL on every one). None is a terminated operator, none is a demo account, and none is
an applicant-only record — each already has an `operators` row.

Replacement pattern: **eleven of the twelve have a newer live document of the same type
for the same operator**, consistent with a re-upload followed by cleanup of the older
copy. The Ali Mohamed cluster (rows 6–11, six files in seventeen minutes) and the
Danny Goodwin row are plainly unit-cost paperwork replaced the same day.

The single exception is **row 1 — Robert Sargent, type `other`, uploaded 2026-06-03,
no newer `other` document on that operator.** If that file mattered, this is the one
that is a loss rather than a replacement. `other` is the catch-all bucket, so its
contents cannot be identified from the record; the file name is a camera-roll string.

## STEP 3 — audit / driver-qualification relevance, on the face of it

Factual position, not legal advice:

- **`truck_title` (1) and `registration` (6)** are vehicle/equipment records, not driver
  qualification file contents. A DQ file under 49 CFR 391.51 holds application, MVR,
  road test, medical certificate and enquiry records — none of these twelve is such a
  document.
- **`form_2290` (3)** are Heavy Highway Vehicle Use Tax Schedule 1 receipts — tax
  records, relevant to IRS retention and to state plate renewal, not to a DOT DQ file.
- **`other` (2)** cannot be classified from the record.
- For all eleven that have a newer same-type live document, the current copy remains in
  the vault and is unaffected by tonight's purge. Nothing currently-authoritative is
  being deleted, on the face of the record.
- The retention policy in force is the one the app states to staff: soft-deleted
  operator documents are recoverable for 30 days and permanently removed afterwards
  (`DeletedDocumentsTray`, `purge-deleted-operator-documents`). There is no longer
  retention rule configured anywhere in the system for these types. Whether 30 days
  satisfies SUPERTRANSPORT's tax and equipment-record obligations is a question for the
  owner and his accountant, not something the system decides.

## STEP 4 — how the owner can stop tonight's purge, and restart it

Neither performed. Three options, cheapest first:

1. **Restore the files in the app (recommended, no database work).** Each operator's
   detail panel has a *Recently Deleted Documents* tray; *Restore* clears `deleted_at`
   and the row stops being eligible immediately. Done before 03:15 UTC, the purge runs
   and finds nothing overdue. Note the tray only lists deletions from the last 30 days,
   so these twelve are **already past the point where the tray shows them** — this route
   needs the tray window widened first, which is a code change.
2. **Pause the job for one night.** `update cron.job set active = false where jobid = 15;`
   To restart: `update cron.job set active = true where jobid = 15;` Nothing else about
   the job changes, and the schedule (03:15 UTC daily) is preserved. Leaving it paused
   simply lets overdue rows accumulate again.
3. **Widen the window in the function.** `purge-deleted-operator-documents` hard-codes a
   30-day cutoff (`Date.now() - 30 * 24 * 60 * 60 * 1000`). Raising it — or making it a
   setting — postpones every overdue row, not just these twelve. This is a code change
   and a deploy.

Option 2 is the only one that stops tonight's run with no code change. It is reversible
in one statement and safe to leave paused for days: the rows and files stay where they
are.

## Open afterwards

One genuinely open item, added to the wish list:

- **Row 1 has no replacement.** Deciding whether Robert Sargent's 2026-06-03 `other`
  document is wanted before it is destroyed needs the owner to look at it, which
  currently needs either the tray window widened or the file fetched by path. Also
  worth a decision: whether the flat 30-day purge window is the right retention rule
  for `truck_title`, `registration` and `form_2290`, which are longer-lived records
  than the window assumes.
