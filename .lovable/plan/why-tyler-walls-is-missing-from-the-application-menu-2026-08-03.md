# Why Tyler Walls is missing from the Application menu

## What the data shows

Tyler Walls does have an application record (email `tylerwalls87@icloud.com`, created May 7 2026, reviewed and **approved** the same day). His row is excluded from every tab of the Application menu because of two field values:

- `is_draft` = true
- `submitted_at` = empty

Every query behind the Application list requires `is_draft = false` (or a staff-handled revision marker) before it will show a record. He is the **only** approved application in the whole system still flagged as a draft — all 94 others are marked submitted. So this is a one-off bad record, not a broken filter.

He was approved without the submit step ever flipping the draft flag (likely approved directly by staff from the applicant's in-progress record), so the pipeline treats him as an unfinished draft even though he is a live, approved driver.

## Fix

Two parts — a data repair and a guard so it can't silently happen again.

1. **Repair his record**: mark the application as submitted (`is_draft` = false) and backfill the submitted timestamp from his review timestamp so he sorts correctly in the list.

2. **Guard the list query**: in the Application menu's fetch, treat any application that has been reviewed (approved / denied / revisions requested) as visible regardless of the draft flag. Today only pending + submitted records are guaranteed to surface, so any future record approved before submission disappears the same way. The pending tab keeps its current behavior — genuine unsubmitted drafts stay hidden.

## Technical detail

- Data fix: one-row update on `applications` for id `7ef1d5c9-7954-480b-a59d-4dad44706156` setting `is_draft = false` and `submitted_at = reviewed_at`.
- Query fix: in `src/pages/management/ManagementPortal.tsx` (`fetchApplications`, and the pending count in `fetchMetrics`), extend the existing `is_draft.eq.false,...` OR-clause to also include `reviewed_at.not.is.null`.
- No schema, RLS, or policy changes needed.
