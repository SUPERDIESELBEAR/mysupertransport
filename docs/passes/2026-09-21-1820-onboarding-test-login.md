# Pass report — 2026-09-21 18:20 UTC — onboarding-only test login

## Scope

BUILD MODE. Create a real staff login holding exactly one role, `onboarding_staff`, so the
"onboarding staff refused" arm of every permission proof can run with a live session, then run
the arms that had never run. Nothing about the permission model itself was changed.

No contradiction with the live system was found: `docs/passes/2026-09-21-1644-staff-suspension-permission.md`
and `docs/passes/2026-09-21-0211-permissions-foundation.md` both record the missing identity, and
no onboarding-only account existed before this pass.

## Step 1 — how staff are created

One path: `supabase/functions/invite-staff/index.ts`. Order of operations: resolve the caller's
company (`companyIdForUser` — no membership is fatal, and no email is sent), create the auth user
(manual-create with a supplied password, or the invite-link path), upsert `profiles`
(`account_status` `active` for manual, `pending` for invites), insert `company_members`, insert
`user_roles`, and only then send the branded Resend email. A failed role write is fatal and stops
the email. No definer function, trigger or scheduled job creates staff.

Side effects of existing as staff: the coordinator picker (`get-staff-list` → PipelineDashboard),
the assignment popup, the notification-assignee modal, the management portal's onboarder workload,
the Staff Directory, and the birthday/anniversary jobs (which key off `profiles.birth_month`).
`notification_preferences` rows are created on demand, not at invite time.

## Step 2 — the account

Created through that path (manual-create, Marcus's session):

- user id `bc0bf6aa-8e61-4ef6-ad03-62e655231898`
- "Test — Onboarding Only", `onboarding-test@demo.mysupertransport.com`
- exactly one role `onboarding_staff`; member of SUPERTRANSPORT `6b54d0e6` (16 members)
- no welcome email (manual-create sends none)

Password: project secret `TEST_ONBOARDING_STAFF_PASSWORD` only. Not in the repository.

Made safe, and how:

- **Never a coordinator, never auto-assigned.** New column `profiles.is_test_account`
  (migration `0024_profiles_is_test_account.sql`, additive, UNDO comment), true for this account.
  `get-staff-list` returns it; `PipelineDashboard.tsx:1131`, `AssignNotificationModal.tsx:82` and
  `ManagementPortal.tsx:784` all skip flagged rows. `operators.assigned_onboarding_staff` count
  for it: 0.
- **Never emailed.** Row in `public.suppressed_emails` (reason `unsubscribe`, metadata naming this
  pass) — the same mechanism Mailgun bounces use. No `birth_month`/`birth_day`, so the birthday
  and anniversary jobs never select it.
- **Visibly a test account.** `StaffDirectory.tsx:254` renders a "Test" badge.
- `profiles.is_demo` was NOT reused: it means "demo DRIVER" and carries email rerouting plus the
  show-demo screen toggle.

## Step 3 — what the session reports

- `GET /user_roles?select=role` → `[{"role":"onboarding_staff"}]` — exactly one.
- Lands on the staff onboarding portal at `/dashboard` (Onboarding Pipeline; sidebar: Onboarding,
  Driver Hub, Vehicle Hub, Fleet Compliance, DOT Inspection Binder, PEI Q, Document Hub, Messages,
  Resource Center, FAQ Manager, Onboard Systems, Notifications). No dispatch, no management.
- `has_permission` asked as itself, for every row of `permission_actions`:

| action | kind | answer |
| --- | --- | --- |
| company_document.send | change | false |
| company_document.view | view | **true** |
| driver.deactivate | change | false |
| invoice.view | view | false |
| lease_termination.change | change | false |
| lease_termination.view | view | **true** |
| release_note.approve | change | false |
| settlement.view | view | false |
| staff_account.suspend | change | false |

Every change-kind action refused; the only admissions are the two view grants
`role_permissions` records for `onboarding_staff`.

## Step 4 — the arms that had never run (probe rule: admitted callers land on a guaranteed failure)

- **Lease termination insert** — `42501 "new row violates row-level security policy for table
  \"lease_terminations\""`.
- **Driver deactivation** (`PATCH operators.is_active = false`) — `42501 "Not authorized to change
  a driver's active status. Deactivating or reactivating a driver is limited to management and the
  owner."`
- **Ordinary onboarding edit on the SAME driver** (`assigned_onboarding_staff`, bogus id) —
  admitted by the policy and stopped one step later: `23503 ... violates foreign key constraint
  "operators_assigned_onboarding_staff_fkey"`. Nothing written: driver `dbe31d0d` is still
  `is_active = true` with coordinator `2cedd3ac` (Mae). This is the arm proving the trigger does
  not break normal onboarding work.
- **Staff suspension** on throwaway `33dd1aee` (created and removed in this pass) — direct path
  `42501 "Not authorized to change a staff account status. Suspending or reinstating a staff login
  is limited to management and the owner."`; through `get-staff-list`
  `{"error":"Forbidden: management only"}`. Throwaway still `active`, then deleted; residue
  `profiles 0, user_roles 0, company_members 0, auth.users 0`. No real staff account was touched.
- **Company document send** (`INSERT document_send_log`) — `42501 "new row violates row-level
  security policy for table \"document_send_log\""`.
- **P2/P3 counts** — `settlements` `*/0`, `invoices` `*/0`, `loads` `0-0/18`: reads loads only.

## Step 5 — the gap is closed

Standard sign-in list for permission passes: Marcus `5cca4f77`
(owner+management+dispatcher+onboarding_staff), Mae `2cedd3ac` (management+onboarding_staff),
Leo `7d80cc10` (dispatcher), **Test — Onboarding Only `bc0bf6aa` (onboarding_staff ONLY)**,
Steve `878be880` (operator), Donald `24ee1b9e` (truck_owner). Recorded in
`docs/tms-build-status.md` under the 2026-09-21 18:05 UTC heading, together with the sign-in
method. Every earlier note that the onboarding-only arm could not run for want of an identity is
answered there.

## Deployment

`get-staff-list` deployed (it now returns `is_test_account`). Confirmed WITHOUT its write path:
the plain list read as Marcus returns 16 rows and the one flagged row is
`('Test —','Onboarding Only',['onboarding_staff'],True)`.

## Suite — `--maxWorkers=4`, verbatim

```
 Test Files  9 failed | 201 passed | 2 skipped (212)
      Tests  15 failed | 2084 passed | 16 skipped (2115)
     Errors  2 errors
   Duration  411.35s
```

The 2 errors are the usual sandbox `[vitest-worker]: Timeout calling "onTaskUpdate"`.

The 15 failures are **not** from this pass. They all belong to the two drafts accepted earlier
today, whose staged migration files were applied and then deleted, so the tests that read those
staged files or count the live inventory no longer line up:

- `src/test/archived-applicants.test.ts` (7) — reads the two staged files
  `20260921150000_review_status_archived.sql` / `20260921150100_backfill_archived_applicants.sql`,
  which no longer exist on disk; the change itself is live.
- `src/test/release-note-approval.test.ts` (file-level) — same cause, staged
  `20260921170000_release_note_approval.sql`.
- `src/test/tenancy-resolver.test.ts` (2) — the live inventory grew by the new
  `release_note_reads` table: `expected 161 to be greater than or equal to 162`. The DONE list
  constant needs the new table appended.
- `src/test/definer-live-catalog.test.ts`, `src/test/definer-search-path.test.ts`,
  `src/test/notification-isolation.test.ts` (1 each) — the draft's definer functions and
  notification insert were applied without a repo migration file for the guards to read.

Left exactly as found, per scope: this pass was asked for an identity and its proofs, not for the
draft bookkeeping. Recommended next: a short pass re-recording the two drafts' SQL as repo
migrations and appending `release_note_reads` to the DONE list.

Typecheck: clean.

## Files this pass authored

- `src/test/onboarding-test-login.test.ts` (new, 11 checks — all passing)
- `docs/tms-build-status.md` (appended: 2026-09-21 18:05 UTC entry)
- `docs/passes/2026-09-21-1820-onboarding-test-login.md` (this report)

Authored earlier in the same pass (recorded here for completeness):
`drizzle/migrations/0024_profiles_is_test_account.sql`,
`supabase/functions/get-staff-list/index.ts`, `src/components/management/StaffDirectory.tsx`,
`src/components/management/staff-directory/types.ts`, `src/pages/staff/PipelineDashboard.tsx`,
`src/components/staff/AssignNotificationModal.tsx`, `src/pages/management/ManagementPortal.tsx`,
`src/integrations/supabase/types.ts`.
