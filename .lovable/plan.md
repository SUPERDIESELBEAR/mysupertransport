## Goal

Finish the §4 (log correction requests) walkthrough end to end against the live app and database, using the existing HARNESS-1 demo malfunction event, then remove every artifact created.

This is a verification run, not a feature build. Code changes happen only if a step fails; each fix is reported with the failing evidence that motivated it.

## What exists already (confirmed by reading)

- `rods_correction_requests` with client helpers in `src/lib/eld/correctionRequests.ts` (raise / fetch-open / decline).
- Driver banner `src/components/operator/rods/CorrectionRequestBanner.tsx`; management view `src/components/management/eld/RodsAdminLogsPanel.tsx`.
- Two migrations (`...011758`, `...012048`) insert `notifications` rows of type `rods_correction_requested` / `rods_correction_resolved`.
- Both types are registered in `src/lib/notifications/taxonomy.ts` as `action` / `watch` under `compliance` — so the Pass B failure mode (row written, nothing rendered) should not repeat. The walkthrough must still prove it renders, not just that the row exists.

## Steps

### 1. Reach a certified log
Restore the demo driver session in Playwright, open the RODS day editor, and drive the real duty-status form:
- Segments that tile the full 1440 minutes.
- All 12 header fields populated.
- A drawn signature and a typed legal name matching the driver.
Assert `rods_days.status = 'certified'` for that date, with `certification_signature_path` and `pdf_path` non-null.

### 2. Amend path
As staff, from the read-only log view raise a correction request against that date.
Assertions:
- Row lands in `rods_correction_requests` with `status = 'open'`.
- The driver sees it on the **rendered** bell — screenshot the bell open with the item under Action, not merely a `notifications` row query.
- Driver amends and certifies. Then: request flips to `actioned`, `resolved_by_day_id` equals the amendment's day id, Management shows the new certified version, and the original row reads `superseded`.

### 3. Decline path
Raise a second request against a different certified date; the driver declines with a written response. Assert the response text is visible in the management panel and the request reads `declined`.

### 4. Auto-close no-op — direct and replayed
The close statement inside `certify_rods_day` runs on every certification, so it must be inert when there is no open request.

- **Direct:** certify a third, unrelated day with no open request. Assert the certification succeeds and the close is a no-op (zero rows touched, no exception).
- **Offline replay:** using the same harness setup that drives offline certification for case (h), queue a certification for a day with **no** open request while offline, then let the queue replay it. Assert the queue entry completes rather than erroring, the day ends `certified`, and no correction-request write is attempted. This is the path where a raise does the most damage: a driver in a dead zone whose queued certify fails on a bookkeeping write cannot diagnose it and has no way around it.

### 5. Write-policy assertion
Query the live catalog (`pg_policies`) after the migrations and confirm there is no INSERT/UPDATE/DELETE policy on `rods_days` or `rods_events` for `management`, `owner`, `dispatcher`, or `onboarding_staff`. Report the exact policy list observed.

### 6. Cleanup
Purge every scratch day via the `purge-rods-day` edge function (amendments before the originals they supersede), delete the correction requests, remove the HARNESS-1 malfunction event and any notifications it spawned. Confirm zero remaining rows with a final query.

## Reporting

A single write-up naming, per step, what was asserted, where it was observed (screenshot path, table + row), and any defect found with the fix applied. Step 2's bell assertion is called out explicitly with its screenshot.
