# SUPERDRIVE — Wish List and Parked Decisions

Companion to docs/tms-build-status.md. That file records what is TRUE and what is
DECIDED. This file records what is PARKED.

Every item carries a TRIGGER: what has to become true before it is worth picking
up. An item without a trigger becomes a graveyard entry. Items leave this list by
being promoted into a build pass or by being explicitly killed — and a killed item
stays here, marked killed, so it is not re-litigated.

Last updated: 2026-09-17

---

## OWNER FOLLOW-UP LIST — before and during the second-carrier demo

Kept at the owner's request (2026-09-16). One line per item, each pointing to the
record entry that explains it. Items are removed only when the record shows them
closed, and the removing pass says so.

- Permissions module: decisions recorded 2026-09-18; inventory done; build STARTED. **Permanent account deletion is CLOSED 2026-09-18 2030 UTC** — the `get-staff-list` `delete_user` branch now requires the `owner` role (403 "Only the owner can delete accounts"), demonstrated on two throwaway accounts: management deleted the first before the fix, was refused on the second, the owner deleted it. Still protected by the user interface alone: deactivate a driver, terminate a lease. Plus the 23 irreversible/outbound edge functions listed under DECIDED, NOT BUILT. (records 2026-09-18 1944 UTC and 2026-09-18 2030 UTC; `docs/passes/2026-09-18-2030-owner-only-delete.md`)

- **Permissions module: DESIGNED 2026-09-21 0132 UTC, NOT BUILT.** P12-P15 recorded (one database function answers "may this user perform this action?"; view and change are separate permissions; the check happens when an action starts; per-person exceptions live in their own table with an optional expiry). The design covers three tables (`permission_actions`, `role_permissions`, `user_permission_exceptions`), the function `has_permission(_user_id, _action)` with the owner short-circuit, closed-by-default with a loud raise on an unknown action key, the `(SELECT ...)` wrapper that keeps it once per statement, and a first slice of five actions: deactivate a driver, terminate a lease, send a company document, dispatcher read of settlements and invoices, suspend an account. **Owner decision owed before building: confirm the five-action slice and its grants.** Also recorded there: creating a second carrier must seed its role grants in the same transaction, or every staff member at the demo carrier is refused everything. (record 2026-09-21 0132 UTC; `docs/passes/2026-09-21-0132-permissions-design.md`)

- Birthday field in the staff directory: no permissions gate exists, front or back; the preview shows it for BOTH Mae and the owner, and the published 2026-09-15 bundle contains it. Confirm it appears for Mae after a HARD RELOAD of the published app — if it still does not, capture her browser's `version.json` and bundle hash first. (record 2026-09-18 1927 UTC; `docs/passes/2026-09-18-1927-staff-birthday-visibility.md`)

### RECENTLY CLOSED

- **RESTRICTIVE-POLICY ROLLOUT: COMPLETE 2026-09-18.** `user_roles` was the last table, migration `0012`. Every company-bearing table in `public` — **159 of them, over 8 passes** — now carries the same restrictive `tenant_isolation` policy (`AS RESTRICTIVE FOR ALL TO authenticated USING/WITH CHECK (company_id = (SELECT public.current_company_id()))`); `company_members` is permanently exempt because the resolver reads it. Live totals **719 policies in `public`, 159 RESTRICTIVE**, linter 170. No real session lost a row and no screen figure changed in any pass. For `user_roles` a lock-out check ran first over all 185 rows: zero company mismatches, zero role-holders resolving to no company, zero users holding roles in more than one company; all five identities reported the same roles and landed on the same portal, Mae's `management` + `onboarding_staff` included. **CROSS-CARRIER ISOLATION REMAINS STRUCTURAL, NOT DEMONSTRATED, UNTIL A SECOND `carrier_profile` ROW EXISTS** — one carrier exists, so no pass could show another carrier's rows being hidden; what is shown is that the policy is present, exactly shaped, and costs the one carrier nothing. (records 2026-09-18 1830 UTC — "`user_roles`, THE LAST TABLE" and "THE RESTRICTIVE ROLLOUT IS COMPLETE"; `docs/passes/2026-09-18-1830-user-roles-last-table.md`)


- Read-enforcement census ran: 148 tables have `company_id`, 12 test it on reads, 123 are readable by role alone, zero restrictive policies. (record 2026-09-16 — "the owner's disposition decision, and the live read-enforcement census", section (c))
- Disposition guard: all three failure branches demonstrated. (record 2026-09-16 — "the unassigned tables, and the second-carrier readiness record" for the missing-list branch; "the owner's disposition decision, and the live read-enforcement census", section (e), for the duplicate-list and stale-entry branches)
- HOW to close read enforcement: DECIDED and now PILOTED — one restrictive `tenant_isolation` policy per company-bearing table. Built on 4 tables, policy count 560 → 564, no real session lost a row. (record 2026-09-16 2007 UTC — "restrictive tenant policy, pilot batch of four")
- MULTI-COMPANY AMBIGUITY: CLOSED 2026-09-16 (owner decision C). A person matching more than one distinct company across `company_members`, `operators` and `truck_owners` now resolves to NOTHING — `current_company_id()` has no `LIMIT` and no `COALESCE` chain, and the edge helpers `companyIdForUser` / `companyIdForAnyUser` throw naming the user. Live census: zero such users today, including inactive rows. A COMPANY SWITCHER REMAINS UNBUILT; its trigger is the first real person who needs two companies. (record 2026-09-16 2226 UTC — "an ambiguous company resolves to nothing"; `docs/passes/2026-09-16-2226-ambiguous-company-refused.md`)
- How failing test files get noticed: ANSWERED 2026-09-17 (owner) — option (1): every pass that changes the database, app code, edge functions or tests runs the WHOLE suite once as its last check before its report, quoting the summary lines verbatim. Docs-only passes may skip it and must say so. `EAUTHQUERY` failures are re-run. Cost about 6.5 minutes. Possible later revision: a DB-free subset every pass plus one weekly full run. (record 2026-09-17 — "cleanup after the suite census, and restrictive batch 2", section (a))

- ELD/RODS keep / hide / remove: **DECIDED 2026-09-17 — HIDE (option (b))**. The ways in were removed (routes, navigation entries, PWA shortcut, the two duty-status cron jobs 402/412, the background sync runner); every table, row, policy, function, trigger, bucket, component and library was KEPT, and the inspection binder stays reachable. Reversible: the exact hidden list is in the record. Emails that stopped: hourly RODS certification reminders and ELD malfunction escalations. (record 2026-09-17 (later) — "ELD/RODS HIDDEN (owner decision (b))…"; `docs/passes/2026-09-17-2005-eld-hidden.md`)

- The twelve UNSTAMPED per-carrier tables: **DONE 2026-09-17** — `drizzle/migrations/0005_stamp_twelve_tables_tenancy.sql` gave `company_id` (NOT NULL, no default, `carrier_profile(id)` ON DELETE RESTRICT), a derived stamp trigger and the exact restrictive `tenant_isolation` policy to `fuel_transactions`, `fuel_transaction_lines`, `fuel_import_batches`, `fuel_disagreement_acceptances`, `operator_broadcasts`, `operator_departing_events`, `operator_parking_events`, `equipment_return_confirmations`, `driver_optional_docs`, `onboard_assignment_sheet_sends`, `staff_event_acknowledgments`, `staff_help_query_log`. Fuel tenancy derives from the IMPORT BATCH, never the driver. Zero nulls everywhere; all five real sessions counted the same rows before and after. `UNASSIGNED` now holds only `driver_documents` and `eld_cron_runs`. (record 2026-09-17 (later) — "the twelve unstamped tables"; `docs/passes/2026-09-17-1940-twelve-tables-stamped.md`)

- The wholesale skip on `view-reachability` is GONE: the six deliberately hidden duty-status views are named in `HIDDEN_VIEWS` and every other portal view is checked again. Shown failing on a seventh unreachable view, then restored. (same record, Step 7)

### DECIDED, NOT BUILT

- **Irreversible or outbound edge functions with no role check** — **CORRECTED 2026-09-18 2103 UTC: the eight named as reading no `Authorization` header at all were MIS-FILED and are OUT of this queue.** `purge-rods-day`, `sweep-rods-orphans`, `delete-osas-sheet`, `set-demo-flag`, `send-ica-review-link`, `send-equipment-return-instructions` and `send-osas-to-operator` all call `requireStaff` with named roles; `file-executed-ica` calls `requireAuthedUser` and then proves the caller is the driver or the linked truck owner for that unit. All eight were called live with the publishable key and no session and returned `401 Unauthorized: missing bearer token`. The 2030 method grepped each function's own text for a role literal and did not follow the `_shared/email` import. Nothing needed fixing and nothing was changed. (record 2026-09-18 2103 UTC)

  **CORRECTED AGAIN 2026-09-18 2155 UTC — "any signed-in user" was wrong for eleven of the fifteen.** Imports followed and `config.toml` read, then one live anonymous call each with the publishable key. The truth:

  - **OPEN TO ANYONE, NO SESSION (5 — this is the real queue, worst first):** `send-transactional-email` (any template to any address, as the company; its own comment claiming `verify_jwt = true` is false), `send-test-email` (emails an arbitrary address a QPassport link minted for a named driver), `pei-auto-cadence` (`verify_jwt = false`; unauthenticated outbound to previous employers — the probe RAN it: 19 evaluated, 19 skipped, nothing sent), `send-release-note` (mails every staff recipient), `encrypt-ssn` (`verify_jwt = false`, header presence only — a use-oracle for the SSN key). The mistake in both earlier passes: "requires a JWT" was treated as a permission, but the publishable key IS a valid JWT.
  - **PROPERLY STAFF-GATED, OUT of the queue (7):** `decrypt-ssn` (management), `export-retention-archive` and `reset-demo-driver` (management, owner), `send-lease-termination` (owner, management — matches P6), `send-insurance-request` (onboarding_staff, dispatcher, management), `send-return-receipt-pdf` and `send-dot-consultant-request` (four staff roles). All refused a driver's live session by role.
  - **OUT for other reasons (3):** `purge-deleted-operator-documents` is cron-secret/service-key only (a session does NOT reach it); `download-qpassport` is gated by a signed expiring HMAC token, by design; `notify-owner-transfer` is not open but BROKEN — its 2.45.0 client has no `auth.getClaims`, so every call throws and the owner's own transfer notice never sends.
  - **P1 BREACHES, small but real:** `decrypt-ssn` and `send-insurance-request` both omit `owner` from their role lists.
  - **No driver reaches another driver's data through any of the fifteen.** The exposure is unauthenticated, not cross-driver.

  (records 2026-09-18 2030 UTC section (e); 2026-09-18 2103 UTC; 2026-09-18 2155 UTC)

  **CLOSED 2026-09-21 0019 UTC — five of the five sound items BUILT, two deliberately deferred.** `send-transactional-email` (internal path = service-role key, staff path = `requireStaff` with all four staff roles; the false `verify_jwt = true` comment removed), `send-test-email` and `send-release-note` (`requireStaff(['owner','management'])`) now refuse every caller who is not signed in; `notify-owner-transfer` moved to `npm:@supabase/supabase-js@2` so `getClaims` exists — it was throwing on every call and the owner's own notice never sent — and its `from_user_id === callerId` gate was proven both ways on a throwaway transfer row (other party 403, the real owner 403, the outgoing party 200); the two **P1 breaches are fixed** — `owner` added to `decrypt-ssn` and `send-insurance-request`. Thirteen of the fifteen now refuse an anonymous call; full after-state table in the record. STILL OWED: `send-test-email` sends the QPassport link to a caller-supplied address rather than only to the operator on the record; and `send-transactional-email`'s INTERNAL path was never exercised live (every route to it either mails a real person or needs the service-role key, which is not readable here) — proven by construction only. (record 2026-09-21 0019 UTC; `docs/passes/2026-09-21-0019-five-function-gates.md`)

  **DEFERRED 1 of 2 — `encrypt-ssn` stays open on purpose.** `requireStaff` would break the last step of every driver application: `/apply` and `/apply/ssn` call it with the publishable key and the applicant has no session. Narrow exposure — it returns ciphertext, stores nothing, reveals no stored SSN and cannot decrypt. OWNER CHOICE NEEDED among: rate-limit it, bind it to the application draft already in progress (recommended), or move encryption server-side so the browser never calls it. Its own pass.

  **DEFERRED 2 of 2 — `pei-auto-cadence` stays open because the lock it would copy has never worked.** See the cron repair below; gating it today would make it the 361st refusal and leave the rest broken. **UPDATE 2026-09-21 0105 UTC: the lock now works** — the blocker is gone, so gating this one is a plain function change. Folded into the new "five ungated cron functions" item below.

- ~~**THE CRON SECRET HAS NEVER EXISTED — several scheduled jobs are being refused every run.**~~ **DONE 2026-09-21 0105 UTC** (record `docs/passes/2026-09-21-0105-cron-secret-repair.md`). Original entry for history: `CRON_SECRET` was not a project secret and `app.cron_secret` was set nowhere, so every function reading it accepted only a service-role bearer that no `pg_cron` command sent; `dispatch-scheduled-broadcasts` logged 360 × `403` in six hours; the nightly purge, cert and inspection expiry checks, idle-operator notices and dispatch rollover were in the same state for ~104 days; the scheduling log said "succeeded" because `pg_net` records only that the request was sent. REPAIRED: secret created, stored in Vault (`ALTER DATABASE` is refused on this project), all twelve job commands now send `x-cron-secret` read at request time. Proof: `403` at 00:31 → `200` at 00:32 and 22 runs since; `pei-auto-cadence` still runs hourly. `ELD_CRON_SECRET` is correct but no job calls `process-eld-escalations` (dormant by earlier decision). Jobs 6, 7, 8, 9, 10, 15 were not triggered by hand (real mail, real deletions, or an unauthorised catch-up) — acceptance confirms on their own next scheduled run.

- **CRON-REPAIR VERIFICATION — STILL OPEN for three of the six** (record 2026-09-21 1135 UTC, `docs/passes/2026-09-21-1135-scheduled-jobs-verified.md`). CLOSED: job 15 `purge-deleted-operator-documents` — proven end to end (12 `document_purged` audit rows at 03:15, `operator_documents` soft-deleted 18 → 6 with 0 past the cutoff, 0 of the 12 storage objects left, 6 ineligible rows intact). ACCEPTANCE PROVEN, EFFECT NOT: jobs 9 / 10 `rollover-dispatch-status` — 200 at 06:05, but see the next item. STILL OPEN: jobs 6 `check-cert-expiry`, 7 `check-inspection-expiry`, 8 `notify-idle-operators` — they run at 15:00 UTC and the repair landed at 00:32 UTC the same day, so at 11:29 UTC they had had no post-repair run at all; not triggered by hand (real mail). To settle: read `net._http_response` between 15:00 and ~20:00 UTC for 6 and 7 (retention is ~6 h and they write no row, so the status code is the only evidence), and count `notifications where type = 'operator_idle'` after 15:00 UTC for 8 — a first run should surface up to 72 coordinator nudges, with the 24-hour dedup quiet on day two.

- ~~**THE DISPATCH ROLLOVER CANNOT SEE STALE DRIVERS — 8 of 45 are wrong on the board, three since June**~~ **FIXED IN CODE, NOT DEPLOYED 2026-09-21 1310 UTC** (record `docs/passes/2026-09-21-1310-rollover-reads-everyone.md`). The capped read is replaced by `public.latest_dispatch_log_per_operator(date)` — `DISTINCT ON (operator_id)`, one row per eligible operator however old, so no row cap can truncate it; NOT a bigger limit and not paging. Proven 45 operators against the old read's 41 today (34 at 1135 — coverage was an accident of recency). Dry run: 8 would change, exactly the eight named at 1135. STILL OPEN: **deployment awaits the owner's review of the dry-run table**, because all eight drivers are `is_active = false` (one deactivated) and their logs are June/August — the function has never filtered on `is_active` and this pass did not add one. One instruction deploys it: "deploy rollover-dispatch-status." Decision owed: filter on `is_active`, add a staleness cutoff, or accept June statuses on the board. Original entry for history: `rollover-dispatch-status` reads `dispatch_daily_log` with no explicit limit, so PostgREST caps it at 1,000 rows of 6,021 — the newest 1,000 cover only 34 distinct operators, which is exactly the `"checked":34` in its 200 response. Every drifted driver's latest log is from June or August, outside that window, so no future scheduled run will ever correct them: Hafeezullah Awal Khan, David Wambolt, Jocquan Scott, Gehazi Irwin, Edward Williams, Tyler Walls, Johnathan McMillan, Christopher Hickman. This corrects the 0105 pass's expectation that the 05:05 run would fix all nine by itself. Fix is a paged or per-operator read in the function; own pass, and it writes live dispatch statuses so it needs the owner's word first.

- **`net._http_response` RETENTION IS ~6 HOURS, so nightly jobs cannot be proven by day** (record 2026-09-21 1135 UTC). Oldest surviving row 05:30 UTC for an 11:29 UTC reading; the 03:15 purge and the 05:05 rollover had both aged out. The proposed reconciler above must record each run's `request_id` in a durable table, or 03:00–05:00 jobs stay unprovable after breakfast.

- **FIVE CRON-TARGET FUNCTIONS HAVE NO CALLER CHECK AT ALL** — `send-birthday-anniversary`, `notify-pwa-install`, `cron-cert-reminders`, `send-unread-message-reminders`, `pei-auto-cadence`. Anyone holding the publishable key can make them mail drivers. All five now receive `x-cron-secret`, so this is a function-only change. `notify-pwa-install` needs a dual staff-or-cron gate — three real UI callers (`ManagementPortal.tsx:889`, `OperatorDetailPanel.tsx:1769`, `DriverRoster.tsx:413`). Own pass. (record 2026-09-21 0105 UTC)

- **NO ONGOING CHECK CATCHES A SILENTLY REFUSED SCHEDULED JOB** — proposed, not built: (1) a repo test asserting every `cron.job` command targeting a `CRON_SECRET` function sends the header (zero runtime cost, catches the exact regression that cost 104 days); (2) one daily 15:30 UTC reconciler scanning `net._http_response` (retention ~6 h) for non-2xx and writing a staff notification, with each command recording its `request_id` in a small `job_run_outcomes` table so jobs outside the window are covered too. (record 2026-09-21 0105 UTC)

- **12 DOCUMENTS WILL BE PERMANENTLY DELETED ON THE NEXT 03:15 UTC PURGE RUN** — 6 registration, 3 form 2290, 2 other, 1 truck title, soft-deleted 2026-06-11 → 2026-07-23, all long past the 30-day window and only still present because the purge was refused. Nothing to do unless the owner wants any of them restored first. Also: the dispatch board is drifted for 9 of 45 eligible drivers and the 05:05 UTC rollover corrects it by itself. (record 2026-09-21 0105 UTC)


- ELD/RODS FULL REMOVAL, if the feature is still unused later — the binder must be unpicked first (`inspection_documents` 774 rows, `truck_dot_inspections` 105, `v_compliance_items`, the MO plate expiry sync, the `/inspect/:token` links and onboarding's binder writes all survive the feature). Costs and breakages: record 2026-09-17 1730 UTC, Part B5 option (c).

- ELD/RODS tables: restrictive batch DONE 2026-09-17 **WITHOUT the offline sync test** — `drizzle/migrations/0003_restrictive_tenant_policy_eld_batch.sql` applied the policy to the ten non-realtime tables (`blank_log_acknowledgments`, `eld_malfunction_events`, `inspection_cycles`, `roadside_stops`, `rods_amendments`, `rods_correction_requests`, `rods_days`, `rods_divergences`, `rods_events`, `rods_unlock_events`). The owner stopped that pass; the offline sync path was NOT re-tested after the policies landed. `truck_dot_inspections` and `inspection_documents` remain PENDING — both are realtime-subscribed, so the owner's live-update check comes first. ELD work is ON HOLD pending the removal decision below. (record 2026-09-17 1730 UTC — "the stopped ELD turn tidied up, and the ELD/RODS removal inventory")

- ~~Restrictive-policy ROLLOUT.~~ **COMPLETE 2026-09-18 — moved to RECENTLY CLOSED above** (`user_roles`, migration `0012`, was the last table). Still true and still worth keeping here: the owner's live-update check PASSED again on 2026-09-18, AFTER the realtime batch (Driver Hub open in one window, a driver's dispatch status changed in another, hub updated without a refresh); and 8 tables are subscribed in source but NOT in the `supabase_realtime` publication, so those subscriptions deliver nothing today (pre-existing) — the pre-check's realtime list also wrongly included `loads` and `deductions`. (records 2026-09-17 2350 UTC — "the LIVE-UPDATING (realtime) batch"; 2026-09-18 1358 UTC — "contractor_pay_setup"; 2026-09-18 1830 UTC — "THE RESTRICTIVE ROLLOUT IS COMPLETE")

- A driver or truck owner cannot be linked to two carriers with one login (`operators_user_id_key` and `truck_owners_user_id_key` are unique system-wide). Design needed before a driver moves between SUPERDRIVE carriers: how he moves without taking his history with him. (record 2026-09-16 2226 UTC — ambiguity entry)
- VERIFICATION GAP: `companyIdForUser` (edge) reads staff membership only; `current_company_id()` reads all three sources. A staff member who is also a driver or truck owner at another carrier gets empty screens while staff edge functions still act for his staff company. (record 2026-09-16 2300 UTC — "restrictive tenant policy, batch 1")
- ~~Next tenancy batch: the twelve MONEY tables.~~ DONE 2026-09-17, migration `0007`, together with nine more money tables that did NOT test company on reads (`settlements`, `settlement_line_items`, `settlement_withheld_loads`, `dispatch_settlements`, `dispatch_settlement_line_items`, `deductions`, `deduction_installments`, `load_charges`, `inspection_program_payments`). For the census twelve the rule was a no-op — their permissive policies already read `(company_id = current_company_id()) AND <role test>` — so those nine are where the batch added a real refusal. (record 2026-09-17 2200 UTC — "the money batch")
- ~~HARNESS GAP: `grant_parity_report()` cannot be called by the test harness.~~ **CLOSED 2026-09-17 2230**, migration `0008`: EXECUTE granted to `"sandbox_exec"` (and explicitly to `"sandbox_exec_qgxpkcudwjmacrdcyvhj"`), never to `authenticated`, `anon` or PUBLIC. The gate added in the 2200 pass is REMOVED, so the check runs unconditionally — 3/3 — and goes red if the privilege is ever lost. Shown failing on a planted offender inside a raising transaction. The 2005 pass's claim that this was already fixed was wrong; the check had not run since 2026-09-14. (record 2026-09-17 2230 UTC — section (c))
- OPEN GAP: two money immutability triggers have never been observed refusing anything. `enforce_remittance_immutability` — `factoring_remittances` holds zero rows, so there is nothing to attempt to change. `enforce_accessorial_adjustment_immutability` — no permissive UPDATE policy admits any of the five identities, so an update is a silent zero-row no-op and the trigger never reaches its check. Both are enabled (`tgenabled = 'O'`). Closing this needs a scratch remittance row and an adjustment UPDATE path, both inside a transaction that raises (see the money-probe standing rule). (record 2026-09-17 2230 UTC — sections (a) and (d))
- STANDING RULE: a verification probe never writes to a real money row outside a transaction that raises; if the psql role cannot perform the write, use a scratch row created and destroyed in that transaction, or test only a refusal that cannot succeed. (record 2026-09-17 2230 UTC — section (a))

- `driver_documents` joins DEFERRED content (nine tables now); `eld_cron_runs` stays GLOBAL. (record 2026-09-16 — "the owner's disposition decision, and the live read-enforcement census", section (a))


### PREREQUISITES BEFORE A SECOND `carrier_profile` ROW

- Cross-carrier read enforcement on the 123 tables readable by role alone. (record 2026-09-16 — "the owner's disposition decision, and the live read-enforcement census", sections (c) and (d))
- `carrier_profile` INSERT/UPDATE/DELETE are role-only: another carrier's management could edit or delete SUPERTRANSPORT's profile. (same entry, section (c), "two further defects")
- `generate-application-pdf`, `send-officer-packet`, `process-eld-escalations` read an arbitrary carrier. (record 2026-09-16 — "the unassigned tables, and the second-carrier readiness record", section (b), items 1–3)
- `receive-rate-con-email` stops for SUPERTRANSPORT (`soleCompanyId`). (same entry, section (b), item 4)
- No path creates carrier #2 with an owner and a membership. (same entry, section (b), item 5)
(MULTI-COMPANY AMBIGUITY moved to RECENTLY CLOSED, 2026-09-16 2226 UTC. The dispatcher broker `DELETE` finding moved to VERIFICATION GAPS: it is a reporting gap, not a prerequisite.)


### OWNER DECISIONS OWED

- PERMISSIONS BUILD, four questions (record 2026-09-18 1944 UTC, section (c)):
  - Where does a permission check belong when an action runs through an edge function using the SERVICE ROLE, which bypasses row rules — in the function, in a database function it must call, or both?
  - How is a READ-ONLY role expressed for a table the app also writes — a SELECT-only policy per role (today's `loads` shape), or one policy that tests the permission table per command?
  - What happens to an IN-FLIGHT action when a permission is removed mid-task — refuse at the next write, or let the open task finish?
  - Do PER-PERSON exceptions live on the same table as the role permissions, or a separate overriding one?
- ~~**Keep, hide or remove the ELD/RODS feature.**~~ DECIDED 2026-09-17: **HIDE** (option (b)) — moved to RECENTLY CLOSED above.
- ~~How to close read enforcement: edit each role-only policy, or add one restrictive company policy per table.~~ ANSWERED 2026-09-16: one restrictive policy per table. Moved to RECENTLY CLOSED above; the rollout of the remaining 118 tables is under DECIDED, NOT BUILT.
- `applications` family (and the 4 PEI tables) visible across carriers, in tension with hand-onboarding the demo drivers. (record 2026-09-16 — "the unassigned tables, and the second-carrier readiness record", section (e), "A tension left unresolved")
- `/apply` falls back to SUPERTRANSPORT's hard-coded identity. (same entry, section (c))
- Nine content tables: SUPERDRIVE default vs carrier version. (record 2026-09-16 — "the unassigned tables…", section (c), content-tables bullet; "the owner's disposition decision…", section (a), DEFERRED content now nine)
- `profiles`: staff of any carrier see every person's name. (record 2026-09-16 — "the unassigned tables…", section (c), `profiles` bullet)
- `inspection_program_settings` read policy is `USING true`: any signed-in user of any carrier. (record 2026-09-16 — "the owner's disposition decision…", section (c), "two further defects")
- `eld_cron_runs` read policy exposes cross-carrier job data (revisit with the `process-eld-escalations` fix). (record 2026-09-16 — "the owner's disposition decision…", section (a), "Noted for later")

### WAITING ON THE OWNER

- ~~Live-update check, owner to test.~~ **DONE 2026-09-17, PASSED**: with the **Driver Hub** open in one window and a dispatch status changed in another, the hub updated WITHOUT a refresh. (The screen is the Driver Hub, not the Driver Roster; Truck Down is set from the Staff portal's Pipeline dashboard, not the Dispatch Board.) This confirms the pilot and unblocked the realtime batch. (record 2026-09-17 2350 UTC — "the LIVE-UPDATING (realtime) batch", section (a))



### VERIFICATION GAPS

- Cross-carrier visibility never demonstrated with a real session. (record 2026-09-16 — "the owner's disposition decision…", section (e); "the unassigned tables…", section (f))
- Deployed edge functions not confirmed to match the repo. (pass report `docs/passes/2026-09-16-1100-second-carrier-readiness.md`, "Deployed-vs-repo parity is NOT confirmed"; cited from the record entry's section (b))
- Full tenancy-resolver run ends in `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`. Quoted, not diagnosed. (record 2026-09-16 — "the owner's disposition decision…", section (e))
- Test tools (`bootstrap-admin` non-owner branch, `create-test-operator`, `provision-test-driver`) break with two carriers. Tools only. (pass report `docs/passes/2026-09-16-1100-second-carrier-readiness.md`, Q1 table; cited from the record entry's section (b))
- Record lines reading "CROSS-CARRIER ISOLATION REMAINS UNPROVEN" imply the isolation is built; for 123 tables it is not. Flag for correction. The wording appears at `docs/tms-build-status.md` **line 14000** and **line 14083** — the reviewer's two line numbers CONFIRMED live 2026-09-16. A third occurrence at **line 14681** is the census entry quoting the wording in order to correct it, not a claim. (record 2026-09-16 — "the owner's disposition decision…", section (c), "The correction this census forces"; the flagged lines sit in the 2026-09-15 B5/B6 entries of `docs/tms-build-status.md` and in `docs/passes/2026-09-15-2115-b6-group-3-driver-remainder.md`)
- The census classifier counted role-AND-author policies (e.g. `broker_notes` author update/delete) as ROLE-ONLY, so 123 is a slight over-count. (pass report `docs/passes/2026-09-16-1840-read-enforcement-census.md`, the classification section)
- `src/lib/__tests__/postgrestEmbeds.test.ts` still fails (2). Cause: the static resolver cannot follow a `.from()` hidden in a helper — `InterviewNotesPanel.tsx:78` is a FALSE POSITIVE (all five columns exist on `application_interview_notes`), and `supabase/functions/_shared/tenancy.ts:42` has no resolvable root since the 2026-09-16 2226 UTC ambiguity pass. Guard limitation, not an app defect. (record 2026-09-16 2338 UTC — "whole-suite census…", section (b))
- `src/test/actor-stamp-fk.test.ts` still fails (1). Cause: never-applied draft SQL, `.lovable/drafts/var_01m289esxfeqxb6s6b4g81wr1p/migrations/20260911140000_quarterly_inspection_program.sql`, stamps `updated_by = auth.uid()` on `inspection_cycles`. Fourth draft-area occurrence. (same entry, section (b))
- `src/test/accessorial-adjustment-schema.test.ts` fails intermittently on the pooler's `FATAL: (EAUTHQUERY) auth_query secret check timed out`; 56/56 on re-run. Any single green or red run of a live-catalog file is one sample. (same entry, section (b))
- Applied-migration history now lives in TWO ledgers: `supabase_migrations.schema_migrations` and `drizzle.__drizzle_migrations`. Any check that queries one alone under-reports. (same entry, section (c))
- `drizzle/schema.ts` is blank, so `drizzle-kit push`/`generate` would propose dropping every live object. Nothing in the repo runs either today (no script, no CI, `LOVABLE_DB_MIGRATION_URL` unset in the sandbox), but adding a `db:push` script would arm it. (same entry, "Safety of the blank `drizzle/schema.ts`")
- Why the batch 2 report omitted the platform-written files is answered only as "the list was written from intended edits, not from `git`". No tooling enforces the new rule. (same entry, section (d) and "Standing rule")
- A zero-row DELETE returns success. The broker delete button is shown to management only (`BrokersListPage` `canDelete={isManagement}`, line 240), so no dispatcher reaches it today; a UI that shows delete to a role the policy refuses would report a false success. (record 2026-09-16 2007 UTC — "restrictive tenant policy, pilot batch of four", section (b); moved here from PREREQUISITES on 2026-09-16 2226 UTC)

### PARKED — named here so the follow-up list is complete; the detail lives elsewhere

- Create the fictitious company, then hand-onboard two or three demo drivers. (record 2026-09-13 — "Decision: the fictitious company gets drivers by walking two or three demo drivers through onboarding by hand"; blocked by "No path creates carrier #2 with an owner and a membership" under PREREQUISITES above. Related but not the same item: "Demo / training environment" below, which is about isolation of demo data.)
- Module 9 reporting: not started. Already recorded in this file in pieces — see "Mileage engine" (RPM), "Driver revenue report period basis (Module 9)", "Per-dispatcher revenue attribution (Module 9)", "Dispatch managers are indistinguishable in the data", "Financial Intelligence token protection", and "Fuel reporting (Module 9)". No separate entry added.
- Module 7 Pass 5 is blocked by the recorded open decision `invoices_load_key UNIQUE (load_id)` — a second invoice row per load is forbidden, so the supplemental container is either a `supplemental_invoices` table or a relaxed constraint, deliberately not chosen. (record — "OPEN DECISION, unresolved, Module 7 Pass 5", in "Module 5, Pass 4 — the late accessorial adjustment path (`-A1`)") **The record names NO blocker, and no pass number, for a Module 7 Pass 6**; delivered Module 7 work stops at Pass 3. Not invented here. Related wish-list entries: "Queue views over loads (Module 7 and later)", "Factoring payout reconciliation (Module 7)", "Late accessorial adjustments — the `-A1` path".
- Deactivation and lease termination work. Already recorded in this file — see "A device type is defined in THREE places" (its TRIGGER is "do it as part of the queued deactivation and lease-termination work") and "Storage objects leak whenever a row is deleted by any route but the app". No separate entry added.
- 13-step cutover purge: re-read end to end before it runs. The "13-step" label is CONFIRMED — the record's subsection is "3. The thirteen ordered steps, and why each sits where it does". (record — "Cutover purge procedure — authoritative, execute on cutover day", `docs/tms-build-status.md` line 1343, and the warning at "The cutover purge procedure was written 2026-09-03. Every pass after it did the right thing individually", line 2361)



---

## PARKED CAPABILITIES

### Per-facility timezone

Freight convention is that appointment times are local to the FACILITY. SUPERDRIVE
now pins everything to the carrier timezone, which is correct while humans on one
clock enter times transcribed from documents. It breaks when a DRIVER records a
time: a driver in Phoenix tapping "arrived" at 08:00 local stores 15:00 UTC, while
an 08:00 appointment stored as carrier-local is 13:00 UTC — he reads two hours
late when he was on time, and that comparison is what a detention conversation
turns on. Natural home is a timezone column on `facilities`, seeded from state
and corrected by hand for the states that straddle zones (TX, FL, TN, KY, IN, ND,
SD, NE, KS, OR, ID, MI), since facilities are a reused registry. No coordinates
exist, so state or ZIP is the only available basis.

TRIGGER: Module 11, driver app check-in.


### Mileage engine
Nothing in SUPERDRIVE can compute distance between two points. `facilities` has no
coordinates, and `load_stops` latitude/longitude are DRIVER CHECK-IN coordinates,
not facility locations. `loads.deadhead_miles` exists but cannot be populated at
parse time, because deadhead is not a property of a load — it depends on where
that driver was previously.

Three known consumers:
  1. Deadhead / empty miles per load (Alvys shows this; see KILLED below)
  2. Chain feasibility as drive time rather than a raw time gap (Module 3, Pass 5)
  3. Revenue per mile — total and loaded RPM (Module 9)

RPM is the one that matters most. It is how carriers judge whether a load was
worth taking, and Module 9 ships without it unless this is solved.

TRIGGER: before Module 9 is specified. Decide then whether SUPERDRIVE computes
mileage, integrates a mileage provider, or ships without RPM deliberately.


### Demo / training environment

A sandboxed area where dummy drivers, rate cons, fuel reports and settlements can
be created freely — for testing, for staff training, and as a sales surface for
SaaS prospects.

The training case is the strongest argument. Nine lease terminations were
generated in error in three weeks by someone who believed the modal was a status
note; a place to click a destructive button and see the consequence without one
is what would have prevented that.

Do NOT build a second mechanism: operators.is_demo already exists and a Demo Mode
item is already in the staff nav. Whatever is built extends that.

The hard part is ISOLATION, not UI. A demo settlement must not reach real
reporting; a demo driver must not receive real email; demo fuel must not
reconcile against a real MultiService invoice. The build context already
anticipates multi-tenancy via company_id on major tables — a demo environment is
arguably the first tenant, and building it that way would exercise the
multi-tenant path before a paying customer does. That argues for building it
after the modules are complete rather than retrofitting isolation later.

TRIGGER: after the module build is complete, and before any SaaS prospect is
given access.

### Truck-owner fleet view — switcher first, summary later

A truck owner should see fuel, loads and anything related to ANY of his trucks.
Shape decided 2026-09-15: A TRUCK SWITCHER FIRST, a fleet summary later.

- The switcher reuses the existing per-driver screens by changing whose data
  fills them — cheap, because those screens already exist.
- A combined DETAIL view (every row labelled with its truck) is a redesign of
  each screen, not an addition to them.
- A combined MONEY summary is easy — settlements, fuel spend and loads
  delivered are sums across his operators.

The order and the reason: build the switcher, and let a month of real use decide
whether the summary earns its place.

OPEN QUESTION, nobody knows yet: whether owners think per-truck or per-fleet.
This is the strongest argument for switcher-first — the switcher works under
either answer.

PREREQUISITE INVESTIGATION, not yet done: 16 policies already use
`is_truck_owner_for_operator`. Whether they cover fuel and loads — and whether
they would cover ALL his trucks rather than one — has NOT been established.
That investigation happens before the switcher is built, not during it.

TRIGGER: after the truck-owner tenancy pass ships (`truck_owners.company_id`,
the resolver's third source), the `is_truck_owner_for_operator` investigation is
done, and a truck owner has actually asked to see his second truck's data.


---

## OPEN QUESTIONS — answer before the named module

### Check-in without a load (SaaS)

A driver can arrive at a facility before the load exists in the system —
dispatch books verbally and enters it later. Rare at SUPERTRANSPORT, likely
elsewhere. Arrival and departure write to `load_stops`, which requires a stop to
exist. Nothing in Pass 2 assumes `load_stops` is the ONLY possible source, so an
unattached check-in reconciled later would be additive rather than a rework. The
provenance model already supports it: a reconciled time would be a third source
value alongside `driver_app` and `dispatcher_entry`.

TRIGGER: first SaaS carrier whose dispatch books ahead of entry.

### Detention terms on the rate confirmation (Module 5, later pass)

Industry standard free time is 2 hours; some brokers write 3. Rate cons also
vary on the CLOCK START TRIGGER — scheduled appointment, actual arrival, or gate
check-in are three different moments and can differ by 30–90 minutes. Many cons
carry daily caps ($200–$400) and a notification requirement. When a driver calls
at hour three, the dispatcher should see this load's terms without opening a
PDF. Candidate for parser extraction into structured fields.

TRIGGER: before the detention claim record is built.

### Detention chase queue

Claims are visible only on their own load. A dispatcher chasing detention wants
one list across all loads, oldest first, with claim age. Same shape as the
paperwork chase queue already parked here — both are load-centric queue views
over a driver-centric system.

TRIGGER: after the claim record has been in real use long enough to know what
the chase workflow needs.

### Dispatch company settlement (Module 4)
The dispatch team is ONE 1099 vendor — a separate company, owner plus team, all
carrying @mysupertransport.com addresses and representing themselves as part of
the SUPERTRANSPORT team, dispatching exclusively for SUPERTRANSPORT.

**The rules are no longer open and are NOT restated here.** Section 4 of
"Settlement rules — the authoritative record" in `docs/tms-build-status.md` is
authoritative for all of: which loads enter the base (4.1), which money (4.2), the
100%-and-reimbursement exclusion predicate (4.3), broker chargebacks (4.4),
factoring as a reduction of the base (4.5), attribution (4.6), schema shape (4.7),
the absence of driver-side machinery (4.8), and loadout loads (4.9).

Four questions previously listed here as OPEN — what the 5% applies to, which
month a load belongs to, whether the factoring share is flat or a percentage, and
whether the dispatch company earns on detention — are all ANSWERED there.

Two things this entry previously said that the build status now supersedes:

  - factoring described as a recurring deduction alongside phone service. It is a
    2% REDUCTION OF THE BASE taken before the 5%; there is no recurring factoring
    line. Superseded by section 4.5 of "Settlement rules — the authoritative
    record" in `docs/tms-build-status.md`.
  - "the settlement tables must serve two payee types." Decided otherwise: the
    dispatch settlement gets its OWN tables and `settlements` is not widened. See
    4.7 for the reasoning, which is recorded so it is not relitigated.

    WHY THE REVERSAL, recorded because the distinction matters: the caution was
    NOT mistaken when it was written. It was written BEFORE the driver settlement
    tables existed, when serving two payee types would have cost almost nothing.
    It was then not applied. By the time the dispatch settlement was designed,
    `settlements.operator_id` was NOT NULL with a cascade FK, the immutability
    triggers were live, and a `paid` settlement existed that any migration would
    have to survive. Separate tables is a decision made AGAINST A KNOWN COST, not
    a judgement that the original caution was wrong.

    The lesson worth carrying: a caution recorded and not applied gets more
    expensive with every pass, and the cost is paid by the pass that finally
    reaches it.

What remains true and unsuperseded here:

  - Two deduction kinds: recurring and configured once (phone service, DAT), and
    per-settlement hand-entered (transaction fees, one-off items such as a claim
    or a load not handled properly).
  - One-off deductions must carry a LOAD REFERENCE. "Claim — $400" is unarguable
    six months later; tied to a specific load it defends itself.

TRIGGER: before the dispatch settlement tables are designed (Module 4).

### Driver revenue report period basis (Module 9)
Gross revenue, net revenue, and itemized deductions with totals, over monthly,
yearly, and total-to-date from first load.

OPEN: does it aggregate by settlement PERIOD or by settlement PAYMENT DATE? The
two-week holdback puts those in different months, and a driver's 1099 cares which.

TRIGGER: before the driver revenue report is built.


### Per-dispatcher revenue attribution (Module 9)
TWO dispatcher relationships exist and they give different answers:
  - `loads.dispatcher_id` — who BOOKED the load
  - `active_dispatch.assigned_dispatcher` — whose DRIVER ran it

These diverge exactly when one dispatcher covers for another, which is the case
that matters most. Neither is wrong; they answer different questions (booking
activity vs book-of-business performance). A report built without choosing will
silently pick one and nobody will know which.

Note also: the Loads list filter labelled "All Dispatchers" means the LOAD-level
field. A Dispatch Board filter would mean the DRIVER-level one. Same words,
different data.

TRIGGER: before any per-dispatcher report is built.

### Dispatch managers are indistinguishable in the data
Jack Barney and Yasir Nawaz are dispatch MANAGERS who carry one or two drivers
each. They hold the plain `dispatcher` role in `user_roles`; nothing in the data
distinguishes them from the four dispatchers carrying six to ten.

Any workload or performance report will rank them as the worst dispatchers.

TRIGGER: before per-dispatcher workload or performance reporting (Module 9).

### Financial Intelligence token protection
The build context specifies a separate access key beyond the owner role. This is
an unusual constraint and will shape how the module is structured.

TRIGGER: confirm still wanted before Module 9 is built.

### Reimbursement pay class — payout rule (Module 4)

Single entry. This was previously recorded twice: here, and as "the reimbursement
pay class payout rule" in the Module 4 deferred-items list in
`docs/tms-build-status.md`. Both versions are merged below; nothing is dropped.
The two did not conflict — they differed only in wording and in the module each
named.

It belongs to MODULE 4. The item concerns how a reimbursement is PAID OUT on a
settlement. Module 5 only decides that a charge carries the classification;
Module 7 only bills it. The settlement is where the payout rule has consequence.

Fully designed, deliberately unbuilt pending a formal spec. Design confirmed:

  - driver-funded expenses reimburse at ACTUAL COST, and only to the party who
    spent it;
  - company-funded expenses (Comdata/MultiService) are company revenue;
  - broker overage is company margin;
  - a proof document is required; an unconfirmed driver-funded reimbursement is
    reported as unsettled rather than paid;
  - unsettled lines HOLD while the rest of the settlement proceeds.

Carried from the Module 4 deferred-items entry: the payout rule ships with the
same pass that brings chargebacks with signed authorization attached, the R&M
Deposit statement (running balance, deposits, withdrawals), and the settlement
preview with a driver dispute window.

Related and deliberately kept separate (Module 4 / Phase 2 reimbursement
decision): lumper stays `revenue` at 100% today. Moving lumper to the
`reimbursement` class is an explicit data migration/review step. Do not infer it
from the presence of `lumper_reimbursement_pct`, and do not automatically
reclassify existing lumper charges.

**This deferral has a LIVE FINANCIAL CONSEQUENCE (recorded 2026-09-02).** Because
lumper is `revenue`, the engine's `funding_source !== 'driver'` guard is never
reached and a lumper SUPERTRANSPORT funded on the fuel card is ALSO paid to the
driver in full — the company pays twice, with no warning anywhere in the UI. See
"A company-funded lumper is paid to the driver in full" in the known-debt section
of `docs/tms-build-status.md`. Detention shares the shape (revenue, 100%, NULL
funding) but not the risk: it is earned from the broker and passed through.

TRIGGER: formal spec written, with Module 4 (settlement payout), before the
settlement engine pays a reimbursement line.

### Queue views over loads (Module 7 and later)

The Dispatch Board is DRIVER-centric — one row per driver with chains hanging off
them. Two jobs are LOAD-centric and should not be worked from it:

  - INVOICING: every load at 'ready_to_invoice', oldest first, regardless of
    driver. This is the billing queue in Module 7.
  - PAPERWORK CHASE: every load on a paperwork tail across all drivers, longest
    outstanding first. Currently only visible by scanning driver rows.

Interim: the Loads list status filter serves the invoicing case adequately.

TRIGGER: invoicing queue with Module 7. Paperwork chase queue after the board has
been in real use long enough to know what the chase workflow actually needs.

### Factoring payout reconciliation (Module 7)

The factoring company issues a payout statement daily for the loads it is
factoring. Invoicing marks those loads paid in Alvys; actual deposits are
confirmed against the bank account by the owner and a third-party bookkeeper.

SUPERDRIVE will need to replace that workflow — ingesting or recording the daily
payout statement, marking loads paid, and supporting deposit confirmation as a
separate step from the statement.

TRIGGER: Module 7, billing and invoicing.


### Late accessorial adjustments — the `-A1` path

**Moved to Module 5, Pass 4 in `docs/tms-build-status.md`.** The design is now
recorded there in full. Module 7 Pass 5 remains the supplemental invoice seam.

This is the second time an item has been filed under two modules. The check going
forward: if a record feeds a settlement, it belongs in Module 5 (or earlier);
only the billing artifact that consumes it belongs in Module 7.

---

## KNOWN DEBT

### document_exceptions has readers and no writer

The paperwork predicate treats an approved or resolved exception as satisfying a
requirement — that path is what stops a receiver refusing to sign from parking a
load on a driver's chain permanently. But nothing in `src` or `supabase/functions`
creates a `document_exceptions` row. There is no filing UI and no edge function;
every touchpoint is a read or a staff resolve.

Consequence: today a load whose POD genuinely cannot be obtained has no way to
clear its paperwork, and under the per-load paperwork hold it would be withheld
from settlement indefinitely.

When the filing UI is built it MUST pass the slot's `photoLabel` on the loadout
path — the scoping fix of 2026-08-31 depends on it, and a NULL label satisfies
nothing labelled.

**TRIGGER: before real freight volume, or with the first load that cannot obtain
its paperwork.**

### Audit and revoke anon EXECUTE across definer functions — LARGELY DONE 2026-09-03, NARROWED
**TRIGGER (remaining scope): before any external launch or SaaS onboarding.**

**It was correct to have been open, and it was not tidiness: it contained a LIVE
UNAUTHENTICATED DATA DISCLOSURE.** The audit ran on 2026-09-03 and found
`public.get_pei_requests_needing_action()` — SECURITY DEFINER, no guard,
anon-executable since 2026-05-13, returning applicant names and prior-employer
contact emails to any holder of the anon key, and with NO CALLER anywhere in the
codebase. Also found `public.email_queue_dispatch()` anon-executable, able to
unschedule the mail-delivery cron. Both were fixed the same day. The full
incident record is in `docs/tms-build-status.md`.

Also done: thirteen no-anon-caller helpers revoked from `PUBLIC` and `anon`;
`is_staff(uuid)` deliberately RETAINED because `/apply` needs it through a
non-definer trigger; live anon-executable definers **48 → 33**; and the anon
inventory guard now requires a written `ROUTE`/`GUARD` justification per entry.

**What remains open, and only this:**

1. The 33 remaining anon-executable definers are INVENTORY — each classified by
   hand on 2026-09-03, each now carrying a written justification. Two carry known
   sensitivities rather than defects: `check_application_email_taken` (email
   enumeration) and `get_application_by_draft_token` (returns all application
   columns — tracked separately as KNOWN DEBT 4.1).
2. The ~161 NON-definer functions carrying `anon=X` were not touched by this
   audit and have never been classified.
3. `KNOWN_AUTHENTICATED_EXECUTABLE` (110 entries) was deliberately not given
   per-entry justifications; a half-populated set would be worse than none.
4. No guard watches functions reached through non-definer triggers running as the
   calling role — recorded as KNOWN DEBT in `docs/tms-build-status.md`.

**This still cannot be done in bulk.** The token-gated public paths —
`resolve_share_token`, `get_application_by_draft_token`,
`get_inspection_doc_by_token`, `resolve_short_link`, the PEI response path and
the application draft-save path — legitimately need anon. Revoking one breaks
`/inspect/:token` or the public application flow **with no obvious symptom**: the
failure surfaces as a blank page to someone outside the company. Classify each
function individually — body read, callers traced, anon-reachability decided.
Do not run a loop.


### Test tooling can change without a commit
**TRIGGER: if a baseline moves and no code change explains it.**

vitest is pinned as `^3.2.4`, so a `node_modules` reinstall pulled 3.2.7 unasked
mid-session, and every recorded baseline is now measured against a version that
arrived by accident. Nothing broke. But the baselines in `gate.ts`, `README.md`
and `tms-build-status.md` are the project's primary evidence that nothing
silently stopped running, and a caret range lets the tool producing that
evidence shift without any commit recording it.

The fix is either an exact vitest pin in `package.json` or a committed lockfile
that the installer respects.

(The canvas-stub half of this entry is resolved: the stub is now re-linked from
vitest `globalSetup` on every run, so no install hook is involved. See
`tools/canvas-stub/globalSetup.mjs`.)

### Reader fixtures for loadPaperwork are AUTHORED, not writer-derived
Standing rule: a persisted shape is tested at both writing and reading
boundaries, with reader fixtures derived from writer output. The Pass 2
loadPaperwork reader fixtures break this knowingly. `document_exceptions` is not
modelled in pgFake at all, and `load_documents` is an empty table there with no
write path, so there is no writer to drive. Stated in the test file header rather
than passed off as derived.

TRIGGER: when `load_documents` gains a write path in pgFake — most likely when
the driver app document upload flow is built (Module 11). Re-derive then.

### Roof-check photo matches on a free-text label
The loadout roof-check requirement matches `photo_label` against the literal
string 'Rear Doors Open'. `photo_label` is free text with suggestions, so a driver
who types anything else does not satisfy it. A coupling assertion keeps the
suggestion list and the predicate in sync, but does not fix the underlying
looseness.

The durable fix is a FIXED CAPTURE SLOT in the driver app, not a looser matcher.
Do not add fuzzy or partial matching to compensate.

TRIGGER: Module 11, driver app guided photo capture.

### A device type is defined in THREE places — KNOWN DEBT, TRIGGER RECORDED

`equipment_items.device_type` is plain `text` with its own CHECK constraint
(`eld`, `dash_cam`, `bestpass`, `fuel_card`). `onboard_assignment_sheet_items.device_type`
is the enum `public.osas_device_type` (those four plus `license_plate`, `registration`,
`ifta_decal`). `RETURN_DEVICE_LABELS` in `DeactivationWizardContent.tsx` is a third list.
Nothing connects the three, so inventory can hold a value the return sheet cannot store —
and the failure surfaces as an offboarding that will not complete, which is a poor place to
learn about a schema mismatch. That is exactly what `fuel_card` did on 2026-09-11.

THE REAL FIX is ONE definition: convert `equipment_items.device_type` to
`osas_device_type` (or a shared `device_type` enum) and derive the wizard's labels from it,
dropping the CHECK. That is a data migration on 219 live rows plus a unique index and a
uniqueness trigger that both reference the column, so it is NOT a drive-by.

TRIGGER: do it as part of the queued deactivation and lease-termination work, not before
it. Until then `src/test/return-sheet-device-enum.test.ts` holds the line — three live arms
(the CHECK's permitted list, the distinct values in inventory, and the wizard's offered
list) all compared to the enum. The CHECK arm is the earliest warning: no row can carry a
value the CHECK does not list, so widening the CHECK — the first step anyone adding a device
type takes — goes red before a single row exists and before any offboarding fails.
Demonstrated red 2026-09-13 by widening the CHECK, inserting one scratch
`toll_transponder` row, and reverting both.

### Storage objects leak whenever a row is deleted by any route but the app

Cleanup lives in TypeScript call sites, so cascades, direct SQL and edge
functions all delete the row and leave the file. Found after four orphans
accumulated in five days from ordinary test reverts.

Worst cases, in order:

- ica-signatures: NO delete path anywhere. DeactivationWizardContent and
  delete-user-account both delete ica_contracts rows outright; signature objects
  are never removed. Permanent leak of signed contract signatures.

- operators cascade: ~40 child tables carrying file paths, none cleaning storage.
  Deleting one operator row orphans that driver's entire document history.
  delete-user-account can reach this.

- loads → load_documents CASCADE: live and silent; no app path deletes a loads
  row yet.

- message-attachments: messages soft-delete and blank the attachment fields, so
  the object survives with nothing referencing it. delete-user-account
  hard-deletes with no storage call.

- Several UI delete paths use .catch(() => {}) on the storage removal, so a
  storage failure silently orphans.

rods-logs is the only bucket with a safety net (sweep-rods-orphans).

Two durable fixes: a delete-time trigger enqueuing paths for a sweeper, or a
periodic per-bucket reachability sweep modelled on sweep-rods-orphans. Per-call-
site cleanup is what failed.

TRIGGER: before real document volume, or before any path that deletes an operator
or a load row ships.

---

## KILLED — do not re-litigate

### Empty miles / deadhead as a Dispatch Board column
Alvys exposes 50+ optional columns via checkboxes. That is a symptom of a product
that does not know what its user needs, so it exposes everything and calls it
flexibility. SUPERDRIVE is opinionated by design.

KILLED as a column. The underlying MILEAGE CAPABILITY remains parked above,
because RPM in Module 9 is a separate and stronger argument.

### Moving `assigned_dispatcher` from `active_dispatch` to `operators`
Considered and rejected 2026-08-26. The column is fully populated (all 34 active
drivers, six dispatchers) and has a working app writer — the inline Edit control
on Driver Status writes it. Exclusion from dispatch is a FLAG on `operators`
(`excluded_from_dispatch`), not a row delete, which was the load-bearing part of
the risk argument. Migrating 34 live assignments and rewiring four readers to fix
a semantic mismatch that has not bitten is not a good trade.

### Formal offer-and-accept step for load assignment
The operating model states there is no formal offer-and-accept step and one
should not be built. `loads.driver_accepted_at`, `driver_declined_at` and
`driver_decline_reason` exist from Module 2 and contradict this. Decision: the
columns STAY, no migration removes them, and no surface treats them as a gate.

---

## SAAS-ONLY — another carrier would want these; SUPERTRANSPORT does not

Items here are NOT built for SUPERTRANSPORT and are recorded so that a prospect
asking for them gets a considered answer rather than an improvised one.

- Empty miles / deadhead per load — requires the mileage engine above
- Broad column customization of list views
- Integration specs for incumbent TMS platforms (McLeod, TMW, Prophet), to avoid
  all-in-one perception

Standing position: a carrier evaluating SUPERDRIVE against Alvys on feature COUNT
will always find Alvys wins. The pitch is the shared data flow — applicant becomes
DQ file becomes dispatched driver with no re-entry. That is the moat, not parity.

---

## HOW TO USE THIS FILE

When something is raised that is not being built now:
  1. Add it here with a TRIGGER
  2. If it is decided against, move it to KILLED with the reasoning
  3. When a trigger fires, promote it into a build pass and remove it from here

Do not let items accumulate without triggers.

### ~435 edge-function queries destructure `data` and discard `error`

`rg` over `supabase/functions/**/*.ts` found **435** `const { data ... }`
destructures. Of those, about **15** touch money or a guard vocabulary (settlement,
charge, deduction, invoice, deposit, advance, policy, rate, hold, load, fuel).
The older "~246" count was an undercount or an older snapshot.

The concentration was never in the edge functions. It was in
`src/lib/settlementRun.ts`'s `gatherSettlementRun`, where a single function
discarded the error on every one of its ~12 reads. That concentration is now
fixed; the remaining edge-function sites are a thin scatter.

Not fixed wholesale: 435 mechanical edits across live functions is a large blast
radius for a change that cannot be verified from tests, and most of the sites are
genuinely tolerant of an empty result.

TRIGGER: bind and check `error` in any edge-function query **at the moment that
function is next edited for any other reason**, and in every new one. When a
function's queries are all checked, note it here. Revisit wholesale only if a
second silent-failure defect of this shape is found in production.

### Broker-level default detention terms
Terms are recorded per load, from the document that stated them. Several brokers
print the same terms on every confirmation, so a dispatcher retypes them each
time, and a mistyped free-time window is invisible until it is quoted back in a
dispute.

Not built: a broker-level default has to be presented as a SUGGESTION that the
document can override, never as a term, and the moment it is stored on the load
its provenance ("this came from the broker record, not this confirmation") has to
travel with it. That is a provenance design, not a defaults form, and there is no
evidence yet on how often the same broker's terms actually vary.

TRIGGER: when a dispatcher reports retyping identical terms for the same broker,
or when parser extraction (Module 5 Pass 3) lands and the parsed-vs-default
disagreement becomes something the system can measure.

### Fuel reporting (Module 9)
The owner has asked to design fuel reporting as part of Module 9. Design
conversation on 2026-09-09 split the ideas into WANTED (in scope for the build)
and HELD (deliberately parked, not rejected, not scheduled).

**WANTED — owner confirmed in scope for the build**

- Per-driver fuel detail, and a company-wide view.
- A per-driver report the owner can **send to that driver** on request. It must be
clean and itemised by the categories a driver will ask about.
- A **weekly exception view before settlements** — outliers and anything unusual,
answering "does anything look wrong before I pay them".
  BUILT 2026-09-13 as `Fuel Exceptions` and UNEVALUATED: two exceptions only (a category new
  to that card, and unmatched rows), baselined per card. It cannot be judged on the single
  import that exists. TRIGGER: after the next real fuel import, open it and confirm the
  exceptions it raises are worth raising.
- **Monthly trend for the business** — total cost, month over month, and average
cost per gallon.
- **Cost per gallon by location**.

**HELD — raised on 2026-09-09 and deliberately parked by the owner**

These are not rejected and not scheduled. Recorded here so they are not lost and
not mistaken for scope:

- Cost per gallon compared against what other drivers paid the same week.
- Gallons against `loaded_miles` — MPG per driver and per truck.
- Fuel as a share of what the driver earned.
- Cash advance patterns as an early signal of financial difficulty.
- Purchases outside a normal window — far from a route, or on a day with no
dispatch.
- Week-over-week change per driver, as an alert rather than a report.

**RECORD WHAT EXISTS TO REPORT ON**

NO FUEL REPORTING EXISTS ANYWHERE TODAY. The import screen lists a batch and its
review queue and nothing else — no sorting, no filtering, no aggregation by
operator.

The underlying data is committed: per transaction the record carries date,
driver, unit, card, the four-bucket split plus discount, diesel gallons, DEF
quantity, cost per gallon, city, state, and match status. The committed set is
**69 transactions covering 2026-08-28 to 2026-09-01, $31,913.66**.

**DATA DEPENDENCY**

Everything in WANTED can be built against those 69 committed fuel transactions
today. Nothing in WANTED requires loads or settlements.

TRIGGER: when Module 9 is specified, or earlier if a driver's fuel spend is
questioned and there is no way to answer it.

### First appearance of a fuel category on a card
Spending limits and permitted purchase categories are enforced upstream, in the
MultiService account portal, at the card. That is why no repair-approval gate is
built in SUPERDRIVE (see "A REPAIR ON THE FUEL CARD…", RESOLVED, in
`docs/tms-build-status.md`).

The residual: those controls are CONFIGURATION and can change. If permitted
categories were ever widened — deliberately or by accident — SUPERDRIVE would
deduct whatever appeared, with no signal that a new KIND of charge had shown up
on a card.

Proposal: flag the **first appearance of a category on a card that has never
carried it before** — a note in the review queue, next to the existing match /
disagreement / unmatched states. A note, NOT a gate: nothing blocked, nothing
held, the money still moves as the statement says.

Design caveat, known now: `fuel_transactions` is EMPTY. On the FIRST import every
card carries every category for the first time, so a naive implementation flags
every row and the signal is worthless. **The first import per card must be
treated as a BASELINE, with flagging from the second import onward** — per card,
not per file, because cards are issued at different times.

Build this AFTER the first real import, so it is designed against actual
card-and-category history rather than a guess about what cards carry. Same
reasoning that let the real 2026-09-05 export catch the `Oil Amt` naming error
that no amount of reading the spec had caught.

NO TRIGGER. This is an idea, not an obligation.
- STANDING RULE WIDENED 2026-09-17 2330: a verification probe never writes to a real row of ANY table outside a transaction that raises — not even as a positive "control". The share-links pass PATCHed `note = 'tenancy probe control'` onto the two `ica_review_links` rows through a real session and it committed; `note` was cleared to NULL and the original text is unrecoverable (both links expired 2026-09-16, so nothing user-facing changed). A probe needing a positive control creates its own row, as that pass's short-link probe did. (record 2026-09-17 2330 UTC — section (c))

### Retention window for equipment and tax documents (2026-09-21)
The purge window is a flat 30 days, hard-coded in
`purge-deleted-operator-documents`, and the *Recently Deleted* tray only lists the
same 30 days — so once a document is overdue, staff can no longer see it in the app
to judge whether it should be kept. Two things open:

- **One unreplaced file.** Of the twelve overdue tonight (see
  `docs/passes/2026-09-21-0118-pending-document-purge.md`), eleven have a newer live
  document of the same type. Robert Sargent's `other` document from 2026-06-03 does
  not. Deciding whether it is wanted before it is destroyed needs a way to view an
  overdue file, which the tray does not currently offer.
- **Is 30 days right for these types?** `truck_title`, `registration` and `form_2290`
  are longer-lived records than a 30-day recovery window assumes. If the owner wants
  a different window for them, the cutoff has to become a setting rather than a
  constant.

NO TRIGGER. Owner's decision.

### Who provisions a second carrier (2026-09-21)
The permissions foundation is closed by default: a `carrier_profile` row with no
`role_permissions` rows means every staff member at that carrier is refused every
protected action. `seed_role_permissions(company_id)` exists and is proven, but it
is service-role only — the tenancy stamp trigger refuses any other caller — and
**nothing calls it**, because nothing creates a carrier today. Whenever a second
carrier becomes real, creating it and seeding its grants has to be one operation in
one edge function holding the service key.

NO TRIGGER. Only matters when multi-tenancy is switched on.

### A settings screen for permissions (2026-09-21)
Grants and per-person exceptions are rows only. Changing who may terminate a lease
or send a company document means a migration or a direct write; there is no screen,
and no audit of permission changes beyond `created_by` / `updated_by`. Worth
building once the action list is closer to the ten actions P10 aims at than the
six that exist now.

NO TRIGGER. Owner's decision.

### The dispatcher's invoice and settlement read is now WIDER than four guards said
Four test files recorded "management and owner only" for settlements, dispatch
settlements and invoices. P2 overrides that for the READ, and the 2026-09-21 pass
amended those guards by name. If the owner ever decides P2 went too far, the three
policies to drop are `settlements_view_permission`,
`dispatch_settlements_view_permission` and `invoices_view_permission` — plus the
four `settlement.view` / `invoice.view` grant rows. Nothing else depends on them.

NO TRIGGER. Recorded so the decision stays reversible.

### The grant-parity harness lost its EXECUTE grant (2026-09-21)
`src/test/grant-parity-live.test.ts` fails with `permission denied for function
grant_parity_report`. Nothing about the report changed: migration 0008 granted EXECUTE to
`sandbox_exec_qgxpkcudwjmacrdcyvhj` and the sandbox role is now plain `sandbox_exec`
(`proacl` still names the old one). One migration granting EXECUTE to the current harness
role restores the check. Left undone deliberately — a grant is a security decision and
this one is the owner's.

TRIGGER. Every full suite from now on carries one red file until it is done.

### Tomorrow's rollover proof is owed (2026-09-21)
The active-only rollover is deployed but unproven in flight. The 2026-09-22 05:05 UTC
response must show `checked` = the active eligible count and `promoted = 0`, and
`net._http_response` keeps it about six hours — so it must be read before ~11:00 UTC.
Durable fallback if missed: no `dispatch_status_history` row noted "Daily rollover from
calendar".

TRIGGER. 2026-09-22, before 11:00 UTC.

### Driver deactivation is now enforced in the database (2026-09-21)
`driver.deactivate` covers both directions — deactivating and reactivating. A BEFORE UPDATE
trigger on `operators` refuses the change unless `has_permission(auth.uid(),
'driver.deactivate')` is true; management holds the grant, the owner passes by
short-circuit. Proven live: the dispatcher is refused (42501) while his ordinary edits on
the same driver still go through.

CLOSED. Nothing remains that changes a driver's active status on the strength of the screen
alone.

### Staff account suspension is the last slice item (2026-09-21)
Switching a staff member's own sign-in off (`profiles.account_status`) is the one sensitive
action from the permissions design still without a database check. Next slice.

TRIGGER. Next permissions pass.

### Absence reasons are staff-only, and carry no settlement meaning (2026-09-21)
The Absence Log is visible to dispatch, management and the owner. Drivers do not
see their own reasons, and nothing in settlement reads them — a week of
`truck_down` has no automatic effect on pay, R&M or the dispatch board's
eligibility counts. The separate Parked control on the driver record is still its
own state and is NOT written by the calendar.

NO TRIGGER. Owner's decision if either should change.

### The harness role cannot run grant_parity_report (2026-09-21)
`src/test/grant-parity-live.test.ts` fails with `permission denied for function
grant_parity_report` for the sandbox psql role, so live grant/policy parity is
unproven in the suite. Pre-existing and unrelated to the Absence Log. Settled by
granting EXECUTE to the harness role only, on a disposable instance first.

NO TRIGGER until someone relies on that guard being green.

## 2026-09-21 14:10 UTC

- OPEN — `public.enforce_driver_deactivation_permission()` is EXECUTE-able by
  `anon` and `authenticated` in the live database and is absent from the
  2026-08-01 definer inventory (two `definer-live-catalog` assertions fail on
  it). Not created by the calendar pass and not fixable from a draft (no DDL).
  Needs its own pass: revoke EXECUTE from both client roles, then re-run.
- OPEN (carried) — harness psql role lacks EXECUTE on `grant_parity_report()`,
  so `grant-parity-live` cannot run.
- NOTE — the absence-reason fallback in `src/lib/dispatchDayLogs.ts` is
  self-clearing: once the staged migration is accepted the full select succeeds
  and the retry path is never taken. It can be deleted at any later tidy-up.
