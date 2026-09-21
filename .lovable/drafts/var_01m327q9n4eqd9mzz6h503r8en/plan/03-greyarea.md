# The seven worth your eyes

Each of these was **denied first**, then archived from the pipeline days or weeks later. So
both things genuinely happened, and the records can't tell me which one you meant to stand as
the outcome. Because the denial came from a review decision, the safe default is to leave them
in Denied. If any of them belongs in Archived, one click on their record moves them there once
this is live.

| Applicant | Denied on | Archived on | Reason on file |
| --- | --- | --- | --- |
| Davien Johnson | Mar 30 | Apr 10 | (none) |
| Rodney Newberry | Apr 6 | Apr 10 | (none) |
| Laura Johnson | Apr 7 | Apr 16 | (none) |
| Michael Scott | Apr 3 | Apr 16 | (none) |
| Christopher Jackson | Apr 16 | Apr 16 | Currently under SAP |
| Jeremy Scott | May 28 | Jun 18 | Army National Guard employment was reserve/monthly |
| Constanze Fanning | May 27 | Jun 24 | MVR and PSP completed, returned clean |

Michelle Watts is not in this group — she is one of the clean 50 and moves to Archived.

# What changes

Nothing about the Archived tab or the Archive button changes; that work is already built. The
only change in this pass is to the one-time move of old records:

- It stays keyed strictly to the "[Archived from pipeline]" tag, so it touches exactly those 50
  and can never reach a genuine denial.
- It skips the seven above, leaving their denial reason and dates exactly as they are.
- A check is added so that if anyone later widens that move, the tests fail.

## Technical detail

- The staged backfill (`...migrations/20260921150100_backfill_archived_applicants.sql`) already
  filters on `review_status = 'denied' AND reviewer_notes LIKE '[Archived from pipeline]%'` —
  50 rows, confirmed by count. It gains a comment recording the verification and the seven
  deliberate exclusions, and an explicit `AND reviewer_notes IS NOT NULL` guard so a blank
  reason can never match.
- Cross-check used: `audit_log` rows with `action = 'applicant_archived'` (58, keyed on
  `entity_type = 'operator'`) joined to `applications` through `operators.user_id`. All 50
  tagged rows have one; none of the other 106 denials do; the seven above have one plus an
  earlier `reviewed_at`.
- `src/test/archived-applicants.test.ts` gains checks that the backfill predicate names the
  tag, requires a non-null reason, and does not select on `reviewed_at`, blank reasons, or the
  audit table.
