# FMCSA Hiring Window Tracking

## Findings (verified against the live database and code)

**1. Is the approval date logged today?**
Partially. When staff click Approve and Invite, the `invite-operator` backend function stamps `reviewed_at` (a full timestamp) plus `reviewed_by` on the application and sets review status to approved. So the moment of approval is captured — but `reviewed_at` is a shared "last reviewed" field: the pipeline's Archive action overwrites it with the denial timestamp. Current data: 231 applications have `reviewed_at`, only 96 are approved. A later denial or re-review rewrites the value, so it is not a durable approval stamp.

Recommendation: add a dedicated `approved_at` column written once at approval and never overwritten by other review actions, backfilled from `reviewed_at` for applications currently approved.

**2. Where does the day counter pill get its start date?**
`OnboardingDaysPill` receives `application_submitted_at`, which the pipeline reads from `applications.submitted_at`. Its current thresholds are 1-14 green, 15-30 amber, 31+ red, and it hides once a driver is fully onboarded.

Yes, it can switch to the PE drug test results date. That date already exists as `onboarding_status.pe_results_date` (15 records populated today) and is not yet loaded by the pipeline query, so it needs to be added to the fetch.

## Changes to build

**Approval date logging**
- Add `approved_at` (timestamp) to applications; backfill approved records from their existing `reviewed_at`.
- Stamp it in the Approve and Invite flow, only when not already set.

**Pipeline ribbon**
- Load `applications.approved_at` and `onboarding_status.pe_results_date` into the pipeline row data.
- Show two compact chips on the applicant ribbon, visible without expanding: "Approved <date>" and "PE Results <date>", each showing an em dash when not yet set.

**Day counter pill**
- Count from `pe_results_date` instead of the submitted date; day 0 is the results date.
- Colors: 0-10 green, 11-20 yellow, 21-30 red, 31+ a distinct destructive "Window Expired" treatment stating the FMCSA hiring window has expired.
- When no PE results date exists yet, the pill shows nothing (same as today with a missing date); still hidden once fully onboarded.
- Tooltip explains the FMCSA 30-day hiring window and shows the results date.

## Technical notes
- Files: `src/components/staff/OnboardingDaysPill.tsx` (prop becomes `peResultsDate`, new thresholds), `src/pages/staff/PipelineDashboard.tsx` (query fields, row type, ribbon chips, both pill call sites), `supabase/functions/invite-operator/index.ts` (stamp `approved_at`).
- One migration: add column plus backfill; no policy changes needed since existing application policies already cover staff reads.