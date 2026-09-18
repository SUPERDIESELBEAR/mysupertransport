# Pass report — the owner's roles-and-permissions decisions, and the sensitive-action inventory

2026-09-18 1944 UTC. BUILD MODE, scope limited by the prompt to
`docs/tms-build-status.md`, `docs/tms-wish-list.md` and this report.

**No migration, no code, no tests, no data changes.** **The full suite was
SKIPPED deliberately — this pass is documentation only**, so there is nothing it
could regress. The prompt's final line (`END OF PROMPT…`) arrived intact; the
prompt was not truncated.

Read first, as instructed: `docs/passes/2026-09-18-1927-staff-birthday-visibility.md`
(no permissions gate on the birthday field; the difference was the build Mae's
browser held) and the role facts in `docs/tms-build-status.md`.

## Contradiction check — nothing forced a STOP, and one thing is worth naming

Nothing in the ten decisions contradicts the live system or the record. Three
decisions describe an END STATE the database does not yet match; those are
recorded as work to build, not as contradictions:

- **P2 (dispatcher may see pay and settlement data)** — today `settlements`,
  `dispatch_settlements`, `invoices` and `payments` are management-and-owner
  only. The dispatcher is excluded. Pay SETUP he can already read.
- **P6 (deactivation and lease termination: owner and management only)** — today
  the database lets ANY staff role do both.
- **P7 (send company documents: owner, management, dispatcher)** — today
  onboarding staff can read `company_documents` and insert `document_send_log`.

**P3 (onboarding staff read loads, never write) is already exactly true in the
database**, which is worth stating because it is the reason P4 stands.

**One departure from the prompt's wording, reported rather than fudged:** the
OWNER FOLLOW-UP LIST contained NO existing roles-and-permissions line to replace
(`grep -i "permission" docs/tms-wish-list.md` returned only the birthday line).
The required line was therefore ADDED, worded exactly as asked plus a pointer to
this report. Nothing was overwritten.

## Step 1 — the decisions

Written into the record as a numbered list, **P1-P11**, under the dated heading
"2026-09-18 1944 UTC — the owner's roles-and-permissions decisions, and the
sensitive-action inventory", section (a), so later passes can cite them
individually. Summary: owner unrestricted (P1); dispatcher sees pay and
settlements (P2); onboarding staff reads loads only (P3); the two roles stay
separate because of P3, the merge is set aside (P4); truck owner sees everything
about his trucks (P5); deactivation and lease termination are owner/management
(P6); company documents go out by owner, management or dispatcher (P7);
enforcement is in the database, a hidden button is not a permission (P8);
permissions attach to roles, per-person exceptions sparingly (P9); first version
covers roughly ten actions and nothing else changes (P10); order of work (P11).

## Step 2 — the inventory

The single table lives in the record, section (b): sixteen rows — the twelve
actions the prompt named, plus read-only load viewing, the correct owner check in
`delete-user-account`, the broker factoring status, and the truck-owner scope.
Each row gives the route/component/file, what enforces it today, who can do it,
and the decisions that bear on it.

**How I looked** (so the next pass can repeat it):

- `pg_policies` read live for `loads`, `invoices`, `settlements`,
  `dispatch_settlements`, `operators`, `lease_terminations`, `document_send_log`,
  `company_documents`, `user_roles`, `pay_policies`, `pay_policy_assignments`,
  `payments`, `brokers`, `contractor_pay_setup`, `cash_advances`, filtered to
  PERMISSIVE — the restrictive `tenant_isolation` policy from the finished
  rollout is about COMPANY, not role, so it tells us nothing here.
- `pg_get_functiondef` for `is_staff`, `is_truck_owner_for_operator`,
  `assign_user_role`.
- Every edge function scanned for a role test: `rg "'role'" supabase/functions/*/index.ts`.
  **111 functions; 64 contain no role check at all.**
- `supabase/config.toml` for `verify_jwt` (`get-staff-list` is
  `verify_jwt = false` and validates the Bearer token itself).
- Screens located by grepping `src/` for each table name and for the action
  strings (`action === '…'`) in `get-staff-list`.

### The findings that matter most

**The three actions protected by NOTHING BUT THE USER INTERFACE:**

1. **Delete an account permanently.** The button is labelled "Owner only"
   (`StaffMemberPanel.tsx:936`, gated on the `isOwner` prop). The
   `get-staff-list` `delete_user` branch (line 164) checks only that you are not
   deleting yourself; the caller check at the top of the function admits
   `management` alongside `owner`. **A management user calling the function
   directly can delete any account.** The correct pattern already exists next
   door: `delete-user-account/index.ts:44-53` does a real
   `.eq('role','owner')` check and refuses otherwise.
2. **Deactivate a driver.** Protected by the route guard `isManagement` at
   `src/App.tsx:230`. The `operators` UPDATE policy is `is_staff()`, and
   `is_staff` admits `onboarding_staff`, `dispatcher`, `management`, `owner`. The
   database does not enforce P6.
3. **Terminate a lease.** `Staff manage lease terminations` is `is_staff()` FOR
   ALL. The builder modal (`components/ica/LeaseTerminationBuilderModal.tsx:132`)
   is reachable from the STAFF portal's operator panel, not only from
   management's wizard.

Plus the wider seam: **64 edge functions with no role check**, including callers
that send mail outside the company, reveal SSNs, or create accounts —
`send-lease-termination`, `send-insurance-request`, `send-ica-review-link`,
`send-equipment-return-instructions`, `send-osas-to-operator`,
`send-transactional-email`, `send-release-note`, `send-return-receipt-pdf`,
`decrypt-ssn`, `encrypt-ssn`, `set-demo-flag`, `export-retention-archive`,
`provision-demo-driver`, `provision-test-driver`, `reset-demo-driver`,
`purge-deleted-operator-documents`. Which screen shows the button is their only
protection.

**The service-role seam, stated once because P8 turns on it:** `user_roles` has
no INSERT, UPDATE or DELETE policy whatsoever. The only in-database grant path is
`assign_user_role()`, which refuses the `owner` role, requires the caller to be
management or owner, and requires a `company_members` row for the target. The
Staff Directory does NOT call it — `get-staff-list` writes `company_members` and
`user_roles` directly with the service role, so those three guards do not apply
to the app's own grant screen. This is the concrete case behind open question 1.

## Step 3 — what the build will have to decide (questions, not answers)

1. Where does a permission check belong when an action runs through an edge
   function using the service role, which bypasses every row rule — in the
   function before the write, in a database function the function is required to
   call, or both?
2. How is a read-only role expressed for a table the app also writes — a
   SELECT-only policy per role (today's `loads` shape), or one policy per command
   that consults the permission table?
3. What happens to an in-flight action when a permission is removed mid-task —
   refuse at the next write and lose the draft, or let the open task finish?
4. Do per-person exceptions live on the same table as the role permissions, or on
   a separate table that overrides it?

## Step 4 — record and list

- `docs/tms-build-status.md` — one appended dated entry: (a) decisions P1-P11,
  (b) the inventory table and the UI-only marking, (c) the four open questions.
- `docs/tms-wish-list.md` — OWNER FOLLOW-UP LIST gained
  "Permissions module: decisions recorded 2026-09-18; inventory done; build not
  started" (added, not replaced — see above); OWNER DECISIONS OWED gained the
  four Step 3 questions.

## Files this pass authored

The platform commits each change as it is made; `git commit` is not available to
the agent, so there is no separate commit of this pass to paste.

- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-18-1944-permissions-decisions-and-inventory.md` (this report)

No application file, edge function, migration, test or database row was touched.
