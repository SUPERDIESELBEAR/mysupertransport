# Fill in the missing Submitted dates on the Applications page

## What's happening

The dash isn't a strike-through — it's the "no date" placeholder, and 43 visible applications genuinely have no submitted date stored:

- 39 approved, 3 in revisions, 1 denied

Two causes, confirmed in the data and the code:

1. **Revision requests wipe the date.** When staff send an application back for revisions (and when a document retake is requested), the backend sets the submitted date back to empty. If the applicant resubmits, the date is written again — but any record that went through that path and never fully resubmitted lost its original date permanently.
2. **Older records (Mar 27 – Jun 15) never had one written**, from before the submitted date was consistently captured.

They also all sort to the top of the list, which is why the Approved tab looks like every date vanished.

## The fix

**1. Backfill the missing dates (one-time data update)**

For every non-draft application with no submitted date, fill it in using the best evidence we have, in this order:
- the applicant's signature date on the application, if present
- otherwise the date the application record was created

Every one of the 43 rows has at least a created date, so no row is left with a dash.

**2. Stop clearing the date going forward**

Requesting revisions or a document retake will no longer erase the submitted date. The original submission date stays, and it gets updated when the applicant resubmits — so Pending, Revisions, Approved, and Denied tabs all show a date at all times.

**3. Sorting**

With every row populated, the newest-first sort works as expected and nothing bunches at the top.

## Technical detail

- Data update on `applications`: `submitted_at = coalesce(signed_date::timestamptz, created_at)` where `submitted_at is null and is_draft = false`, plus the three `revisions_requested` rows still flagged as drafts.
- `supabase/functions/request-application-revisions/index.ts` (line ~115) and `supabase/functions/request-document-retake/index.ts` (line ~157): remove `submitted_at: null` from the update payload.
- `src/pages/management/ManagementPortal.tsx` `fetchApplications`: add `nullsFirst: false` to the `submitted_at` order as a safety net for any future gap.

Note: backfilled dates are approximations from the record's creation/signature date, not recovered original timestamps.
