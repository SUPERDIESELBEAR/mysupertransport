# What I would build

1. An **Archived** tab on the Applications page, between Denied and All, with its own count.
   `?status=archived` deep-links to it.
2. An **Archive** action beside Deny on an applicant's record, for setting someone aside who may
   still be hired. It records an optional reason and **sends no email** (a denial still does).
3. From an archived record: **Move back to Pending**, or **Deny instead** through the existing
   denial flow (which does send the denial notice).
4. Archived is shown neutrally — never with the red denied styling — and is counted apart from
   denials everywhere a denial count is shown.

Nothing about denials changes, and no applicant's data changes beyond its outcome label.

## Technical detail

- `src/pages/management/ManagementPortal.tsx`: add `archived` to `StatusFilter` (line 129), to the
  `?status=` whitelist (line 258), to the tab array (line 1937), and to the status colours. The
  `.eq('review_status', statusFilter)` fetch at line 828 needs its cast widened to include
  `archived`; the counts query alongside it gets the new bucket.
- New `handleArchive(appId, note)` — direct `applications` update to `archived` plus an `audit_log`
  row (`action: 'application_archived'`). No `functions.invoke`, so no applicant email;
  `deny-application` is untouched.
- New `handleUnarchive(appId, target)` — back to `pending` (clearing `reviewed_at` / `reviewed_by`,
  audit `application_unarchived`) or hand off to the existing deny flow.
- Wire both into `ApplicationReviewDrawer` via its already-present optional `onArchive` /
  `onUnarchive` props — the drawer's archive button, neutral confirmation, "set aside" reason panel
  and archived footer are already built and currently dead code. StaffPortal's usage stays as is.
- No database change: `review_status` already carries `archived` (50 rows live) and the pipeline
  already writes it (`src/pages/staff/PipelineDashboard.tsx` line 1251). Grants and policies unchanged.
- Verification: extend `src/test/archived-applicants.test.ts` — its Applications-page checks
  currently fail because the tab and handlers are missing; they must pass. Then typecheck and the
  full suite with `--maxWorkers=4`.
