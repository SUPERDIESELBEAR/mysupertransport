# SUPERDRIVE — Wish List and Parked Decisions

Companion to docs/tms-build-status.md. That file records what is TRUE and what is
DECIDED. This file records what is PARKED.

Every item carries a TRIGGER: what has to become true before it is worth picking
up. An item without a trigger becomes a graveyard entry. Items leave this list by
being promoted into a build pass or by being explicitly killed — and a killed item
stays here, marked killed, so it is not re-litigated.

Last updated: 2026-09-23

---

## OWNER FOLLOW-UP LIST — before and during the second-carrier demo

Kept at the owner's request (2026-09-16). One line per item, each pointing to the
record entry that explains it. Items are removed only when the record shows them
closed, and the removing pass says so.

- **DEMO CARRIER STAGE 1 of 6: DONE 2026-09-22 2105 UTC — the survey.** Live: one carrier, 164 tables carry `company_id` and **163 of them carry the restrictive `tenant_isolation` policy**, so cross-carrier read enforcement on company-bearing tables is structurally CLOSED (the "159 tables" figure was a policy count, not an unenforced-table count). **37 tables carry no `company_id`** and are the remaining exposure, alongside ~50 role-only `storage.objects` policies. The original four prerequisites all still stand, and a FIFTH of the same class was found: `company_pay_policy_on(date)` has no company filter and is called from four SECURITY DEFINER functions, so two rate sheets would silently price accessorial adjustments, the driver earnings estimate and the 05:10 mirror from an arbitrary carrier. Would break carrier A's LIVE operation if the row were created today: rate-con email ingestion (`soleCompanyId`), that pay resolver, `bootstrap_assign_owner`, the nine bare `carrier_profile` subqueries in `tenancy-resolver.test.ts`, and `generate-application-pdf`. (record 2026-09-22 2105 UTC; `docs/passes/2026-09-22-2105-demo-carrier-stage-1.md`)

- **DEMO CARRIER STAGE 2 of 6: DONE 2026-09-23 1130 UTC — the five day-one breaks closed.** Migration 0042: `company_pay_policy_on` now takes a company (the one-argument form DROPPED) and its four definer callers each pass the carrier they already work in; the rate-con ingest address is a per-carrier column on `carrier_profile`, backfilled for USDOT 2309365, with an unroutable recipient dropped once two carriers exist; `bootstrap_assign_owner` is parameterised and raises 42501 when the company is omitted and more than one carrier exists; the nine bare `carrier_profile` subqueries plus two silently-wrong reads now name USDOT 2309365; `generate-application-pdf` takes the resolved company and generates nothing if it cannot resolve one. Left deliberately: `process-eld-escalations` and `send-officer-packet` still print an arbitrary carrier's DOT line — that belongs with the ELD identity work. (record 2026-09-23 1130 UTC; `docs/passes/2026-09-23-1130-demo-carrier-stage-2.md`)

- **DEMO CARRIER STAGE 3 of 6: DESIGNED 2026-09-23 1310 UTC, NOTHING BUILT — AWAITING ONE OWNER ANSWER.** Owner decision 2026-09-23: applications and the PEI family become per-carrier, superseding the 2026-09-13 global decision. TRIGGER for building: **how an anonymous applicant's record gets a carrier.** Recommended, not chosen: a **per-carrier apply link**, with the invite path falling out of it and a sole-carrier fallback behind it — the only option that also fixes the fact that `useCompanyIdentity` cannot read `carrier_profile` as `anon` and therefore prints the hard-coded SUPERTRANSPORT name and DOT on **every carrier's applicant disclosures**. The demo alone needs only the invite path. A default-carrier flag would keep `company_id` nullable forever. Recorded live facts: 346 applications (77 drafts), 144 PEI requests, **zero unexpired resume tokens** so no token in the wild can break, `pei_cadence_settings` already per-carrier, and the family's **only** anonymous table privilege is `anon`'s INSERT on `applications`, which the design closes entirely. `profiles` follows and must never get a `company_id`. Five build passes named (3a-3e). (record 2026-09-23 1310 UTC; `docs/passes/2026-09-23-1310-applications-per-carrier-design.md`)

- **DEMO CARRIER STAGE 3, PASS 3c of 5: DONE 2026-09-23 1730 UTC — the isolation rules.** Correction to the record: an earlier summary claimed 3c done; it was not — **not one of the eleven tables carried a restrictive policy** before migration `0046_applications_family_restrictive_tenant_policy.sql`. Now all eleven carry `tenant_isolation` as `RESTRICTIVE FOR ALL TO authenticated`, matching the other 163 company-bearing tables. Ten take the standard predicate; **`applications` alone** takes the wider `company_id = (SELECT current_company_id()) OR user_id = auth.uid()`, because `ApplicationStatus.tsx` reads the applicant's own row by `user_id` and a signed-in applicant resolves to NO carrier under decision C — a new fixture fails if that predicate ever appears on another table. `PENDING_RESTRICTIVE` is empty. No permissive policy, writer, grant, definer function, edge function or screen changed; the anonymous door needed nothing, since `anon` reaches the family only through the two definer RPCs. Proven with a scratch carrier inside a raising transaction: a second carrier's staff member sees **0** of SUPERTRANSPORT's 346 applications and 0 of every PEI and correction table, and only his own row — before 0046 he would have seen all of it, SSNs included. `/apply` driven end to end as a real anonymous caller and removed, residue zero. Unchanged for SUPERTRANSPORT as Marcus, Mae, the onboarding-only login and Steve's driver app. One environmental failure fixed in passing: migration `0047` grants the read-only `grant_parity_report()` to the generic `sandbox_exec` harness role the sandbox now connects as, restoring that safety net. **3d — the per-carrier apply link and the letterhead — is next.** (record 2026-09-23 1730 UTC; `docs/passes/2026-09-23-1730-applications-per-carrier-3c.md`)
- **DEMO CARRIER STAGE 3, PASS 3b of 5: DONE 2026-09-23 — every writer stamps the carrier.** Migration `0045_applications_roots_stamp_company.sql`: `stamp_application_company()` (definer, pinned, EXECUTE revoked from PUBLIC/anon/authenticated) fires BEFORE INSERT on `applications` and `application_invites`. A resolvable signed-in caller gets their own carrier and a **disagreeing** caller-supplied carrier is **REFUSED** (42501), not overwritten — roots refuse, children derive; `service_role` naming a carrier explicitly is trusted; an anonymous insert resolves the sole carrier **while exactly one exists** and is REFUSED at two or more, until the apply link (3d). `invite-applicant` takes the carrier from the inviting staff member, `provision-demo-driver` from the provisioned user, `create-test-operator` from `soleCompanyId`; `StaffApplicationModal` and `provision-test-driver` needed no change. **Design correction, in the safe direction:** `anon` has NO privilege on `applications` at all — the public form runs entirely through `save_application_draft`/`submit_application_draft`, so 3c has no anon grant to revoke. Proven: all six entry paths stamped SUPERTRANSPORT; with a scratch carrier inside a raising transaction, an anonymous insert refused, a scratch-staff application and invite resolved to scratch, a cross-carrier insert refused; `/apply` driven end to end by a throwaway applicant and removed, residue zero. Unchanged for SUPERTRANSPORT as Marcus, Mae and the onboarding-only login: pipeline 37 / 7 / 3, Applications Pending 7 / Archived 50, PEI queue and one full review drawer intact. **3c (restrictive policies) is next.** (record 2026-09-23 1600 UTC; `docs/passes/2026-09-23-1600-applications-per-carrier-3b.md`)
- **DECISION OWED, NOT BLOCKING: one live application per email across ALL carriers.** `applications_email_non_draft_unique` carries no carrier, so a candidate with a live application at SUPERTRANSPORT cannot file one at another carrier. Correct (one candidate, one carrier at a time) or wrong (each carrier's hiring is its own business)? Does not block 3c/3d/3e; must be settled before a second carrier recruits. (record 2026-09-23 1600 UTC)
- **DEMO CARRIER STAGE 3, PASS 3a of 5: DONE 2026-09-23 — the carrier column and the backfill.** Migration `0043_applications_family_company_column.sql`: a NULLABLE `company_id uuid REFERENCES carrier_profile(id) ON DELETE RESTRICT` on all eleven tables of the applications and PEI families, backfilled from the sole carrier and, for the nine children, through their parent joins. Counts, all exact and all zero NULL after: applications 346, application_invites 5, correction requests 80, correction fields 137, document history 12, interview notes 2, revision attachments 1, PEI requests 144, PEI responses 16, PEI accidents 1, PEI request events 527. Each child carries a BEFORE INSERT OR UPDATE trigger (`stamp_child_company_from_parent`) that DERIVES the carrier from its parent and OVERWRITES anything a caller supplies, proven on a correction request, a PEI response and a PEI event with a scratch carrier inside a transaction that raised — zero residue, one carrier, zero unexpired resume tokens before and after. `application_document_history` is append-only, so the backfill ran with `DISABLE TRIGGER USER` on all eleven tables, parents before children, then re-enabled — no append-only guard and no event-logging trigger was weakened or removed. NO policy, definer function, edge function, screen or anon grant changed; that is 3b/3c. Migration `0044` revokes EXECUTE on the new trigger function from PUBLIC/anon/authenticated, matching `stamp_tenant_company_id`. Guard lists updated: `GLOBAL_TABLES` 19 → 12 (the seven application tables left by being STAMPED, not decided away), `AWAITING_APPLICATIONS` retired, the eleven tables declared in `PENDING_RESTRICTIVE` until 3c. Unchanged for SUPERTRANSPORT, proven with real sign-ins as Marcus, Mae and the onboarding-only login: pipeline 37 / dispatch 7 / rate-con 3, PEI queue 144, one application opened in the review drawer with its correction, document-history and PEI panels intact. **3b (writers stamp) is next.** (record 2026-09-23; `docs/passes/2026-09-23-1420-applications-per-carrier-3a.md`)

- **DECISIONS OWED BEFORE DEMO-CARRIER STAGE 2.** TRIGGER: stage 2 cannot start without them. (1) `applications` + the PEI family — **ANSWERED 2026-09-23: per-carrier** (see stage 3 above; one sub-question remains, how an anonymous applicant's record gets a carrier). hand-onboarding demo drivers puts carrier B's applicants, **SSNs included**, in a table carrier A's staff read and can delete. (2) `profiles` — GLOBAL with staff reads scoped through `company_members`/`operators`, or per-carrier. (3) The nine content tables (`faq`, `faq_history`, `services`, `service_resources`, `resource_documents`, `resource_history`, `message_templates`, `email_templates`, `driver_documents`) — product-level or per carrier. (4) `release_notes` — product-wide or per carrier. (5) Does the demo carrier get its own `/apply` link (today `/apply` prints the hard-coded SUPERTRANSPORT name and DOT to any carrier's applicant). (6) Does it share the sending domain and email templates. (7) Is a shared content library acceptable for a demo at all — that answer collapses or expands items 1-6. (record 2026-09-22 2105 UTC)



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

- ~~**CRON-REPAIR VERIFICATION — open for three of the six**~~ **CLOSED 2026-09-21 1550** (record 2026-09-21 1550 UTC, `docs/passes/2026-09-21-1550-cleanup-2026-09-21.md`). The last three ran on their own schedule at 15:00 UTC and all three did their work: job 6 `check-cert-expiry` 200 `{"inserted":2,"emailsSent":2}` with 2 `cert_expiry_30d` notifications; job 7 `check-inspection-expiry` wrote 14 `inspection_doc_expiry` notifications; job 8 `notify-idle-operators` wrote 72 `operator_idle` notifications across 72 distinct operators — exactly the 72-record backlog, no duplicates, 64 of them to Mae. Jobs 7 and 8 show only a `Timeout of 5000 ms reached` row in `net._http_response` (see the new pg_net item), so their acceptance rests on what they wrote. Jobs 9/10 and 15 were already settled. ORIGINAL ENTRY FOR HISTORY: (record 2026-09-21 1135 UTC, `docs/passes/2026-09-21-1135-scheduled-jobs-verified.md`). CLOSED: job 15 `purge-deleted-operator-documents` — proven end to end (12 `document_purged` audit rows at 03:15, `operator_documents` soft-deleted 18 → 6 with 0 past the cutoff, 0 of the 12 storage objects left, 6 ineligible rows intact). ACCEPTANCE PROVEN, EFFECT NOT: jobs 9 / 10 `rollover-dispatch-status` — 200 at 06:05, but see the next item. STILL OPEN: jobs 6 `check-cert-expiry`, 7 `check-inspection-expiry`, 8 `notify-idle-operators` — they run at 15:00 UTC and the repair landed at 00:32 UTC the same day, so at 11:29 UTC they had had no post-repair run at all; not triggered by hand (real mail). To settle: read `net._http_response` between 15:00 and ~20:00 UTC for 6 and 7 (retention is ~6 h and they write no row, so the status code is the only evidence), and count `notifications where type = 'operator_idle'` after 15:00 UTC for 8 — a first run should surface up to 72 coordinator nudges, with the 24-hour dedup quiet on day two.

- ~~**THE DISPATCH ROLLOVER CANNOT SEE STALE DRIVERS — 8 of 45 are wrong on the board, three since June**~~ **FIXED IN CODE, NOT DEPLOYED 2026-09-21 1310 UTC** (record `docs/passes/2026-09-21-1310-rollover-reads-everyone.md`). The capped read is replaced by `public.latest_dispatch_log_per_operator(date)` — `DISTINCT ON (operator_id)`, one row per eligible operator however old, so no row cap can truncate it; NOT a bigger limit and not paging. Proven 45 operators against the old read's 41 today (34 at 1135 — coverage was an accident of recency). Dry run: 8 would change, exactly the eight named at 1135. STILL OPEN: **deployment awaits the owner's review of the dry-run table**, because all eight drivers are `is_active = false` (one deactivated) and their logs are June/August — the function has never filtered on `is_active` and this pass did not add one. One instruction deploys it: "deploy rollover-dispatch-status." Decision owed: filter on `is_active`, add a staleness cutoff, or accept June statuses on the board. Original entry for history: `rollover-dispatch-status` reads `dispatch_daily_log` with no explicit limit, so PostgREST caps it at 1,000 rows of 6,021 — the newest 1,000 cover only 34 distinct operators, which is exactly the `"checked":34` in its 200 response. Every drifted driver's latest log is from June or August, outside that window, so no future scheduled run will ever correct them: Hafeezullah Awal Khan, David Wambolt, Jocquan Scott, Gehazi Irwin, Edward Williams, Tyler Walls, Johnathan McMillan, Christopher Hickman. This corrects the 0105 pass's expectation that the 05:05 run would fix all nine by itself. Fix is a paged or per-operator read in the function; own pass, and it writes live dispatch statuses so it needs the owner's word first.

- **pg_net GIVES UP AFTER 5000 ms, AND A TIMEOUT ROW IS NOT A FAILURE** (record 2026-09-21 1550 UTC). Jobs 7 `check-inspection-expiry` and 8 `notify-idle-operators` both completed correctly on 2026-09-21 at 15:00 UTC — 14 and 72 notifications written — while `net._http_response` recorded no status code and `Timeout of 5000 ms reached`. Any job slower than five seconds can therefore only be judged by the rows it wrote, never by its response. The proposed reconciler must not read a NULL status as a refusal.

  TRIGGER. Before the reconciler in the item above is built.

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

### ~~The grant-parity harness lost its EXECUTE grant (2026-09-21)~~ CLOSED 2026-09-21 1550
Migration `0019_grant_parity_report_execute_regrant.sql`: EXECUTE granted to `"sandbox_exec"` and
`"sandbox_exec_qgxpkcudwjmacrdcyvhj"`, PUBLIC / `anon` / `authenticated` revoked as before. The file
passes 3/3 and the report returns 0 offenders. Cause established from the catalog, not migration text:
the harness role name never changed and the function was never recreated — sandbox provisioning
RECREATES the bare role `sandbox_exec` (oid 35560, newer than the suffixed 27530), which strips it from
every ACL in the cluster; provisioning then re-issues table grants (221 public tables carry a fresh
`sandbox_exec=ar/postgres` no migration wrote) but not function EXECUTE.

**IT WILL BREAK AGAIN.** Second occurrence in four days. What would make it stick, none of it inside
this repo: provisioning granting function EXECUTE the way it grants table `ar`; the harness connecting
as the durable project-suffixed role, which already holds EXECUTE; or the guard calling the report
through an RPC as `service_role` instead of psql. The test is deliberately NOT gated — a lost privilege
must go red.

TRIGGER. The next time a full suite shows this file red, apply the same re-grant and consider the
third option above.

### ~~Tomorrow's rollover proof is owed (2026-09-21)~~ CLOSED 2026-09-22 1100
Read in flight at 10:52 UTC. Both runs 200: 05:05 UTC and the 06:05 CST twin returned
`{"today":"2026-09-22","checked":33,"promoted":0,"skipped":33,"errors":[]}` — the board
agreed with the calendar for every driver the sweep saw, and nothing was written. `checked`
is 33, not the 34 expected: 43 operators are active, not excluded and not parked, and 33 of
them have any `dispatch_daily_log` row at all, which is exactly the eligible set. The
active-only rule holds. Original entry for history: the active-only rollover was deployed but
unproven in flight; `net._http_response` keeps a row about six hours so it had to be read
before ~11:00 UTC.

CLOSED.

### ~~Idle-operator dedup, day two (2026-09-21)~~ CLOSED 2026-09-22 1100 — read again after 15:05
At 10:52 UTC, `operator_idle` notifications dated 2026-09-22: **0**, against 72 written
yesterday. The 15:00 UTC run had not happened yet at reading time, so day two's own dedup is
proven only for what exists so far; the same count read after 15:05 UTC settles it, and 0 new
rows is the expected answer.

### Driver deactivation is now enforced in the database (2026-09-21)
`driver.deactivate` covers both directions — deactivating and reactivating. A BEFORE UPDATE
trigger on `operators` refuses the change unless `has_permission(auth.uid(),
'driver.deactivate')` is true; management holds the grant, the owner passes by
short-circuit. Proven live: the dispatcher is refused (42501) while his ordinary edits on
the same driver still go through.

CLOSED. Nothing remains that changes a driver's active status on the strength of the screen
alone.

### Staff account suspension — CLOSED 2026-09-21 1644 UTC, and with it the FIRST SLICE
Switching a staff member's own sign-in off (`profiles.account_status`) now requires
`staff_account.suspend`, granted to management, held by the owner through the short-circuit and
seeded for every new carrier. Both paths are gated: the `get-staff-list`
`deactivate_user` / `reactivate_user` actions (asking `has_permission` as the CALLER, not as the
service role) and the direct PostgREST update, which trigger
`aa_enforce_staff_suspension_permission` on `profiles` refuses. Order in both:
own account (P19) → owner target (P18) → permission (P17). Proven on a throwaway account that
was created, blocked from signing in, reinstated and deleted with zero residue; no real account
was suspended.

**FIRST SLICE COMPLETE — all five actions enforced:** account deletion, lease termination,
company-document sending, driver deactivation, staff suspension. No sensitive action is
protected by the screen alone.

NOT YET REACHED by the permissions module (design Step 5): settlement approval and voiding,
invoice issue and void, accessorial approval, fuel-import commit, pay-rate and policy changes,
and per-person exceptions in day-to-day use (the table exists and is enforced; nothing grants
one yet). A settings screen for permissions also remains unbuilt.
(record 2026-09-21 1644 UTC; `docs/passes/2026-09-21-1644-staff-suspension-permission.md`)


### Absence reasons are staff-only, and carry no settlement meaning (2026-09-21)
The Absence Log is visible to dispatch, management and the owner. Drivers do not
see their own reasons, and nothing in settlement reads them — a week of
`truck_down` has no automatic effect on pay, R&M or the dispatch board's
eligibility counts. The separate Parked control on the driver record is still its
own state and is NOT written by the calendar.

NO TRIGGER. Owner's decision if either should change.

### ~~The harness role cannot run grant_parity_report (2026-09-21)~~ CLOSED 2026-09-21 1550
Duplicate of the item above, raised again by the Absence Log pass. Settled by migration `0019`; see
that entry for the cause and for why it is expected to recur.

## 2026-09-21 14:10 UTC

- OPEN — `public.enforce_driver_deactivation_permission()` is EXECUTE-able by
  `anon` and `authenticated` in the live database and is absent from the
  2026-08-01 definer inventory (two `definer-live-catalog` assertions fail on
  it). Not created by the calendar pass and not fixable from a draft (no DDL).
  Needs its own pass: revoke EXECUTE from both client roles, then re-run.
- ~~OPEN (carried) — harness psql role lacks EXECUTE on `grant_parity_report()`,
  so `grant-parity-live` cannot run.~~ **CLOSED 2026-09-21 1550**, migration `0019`;
  3/3 passing. Expected to recur when the sandbox is re-provisioned.
- NOTE 2026-09-21 1550 — **the Absence Log schema is now LIVE**, applied by the other
  session as `drizzle/migrations/0018_absence_log_reasons.sql` (journal idx 18): the
  `absence_reason` enum (8 labels), `dispatch_daily_log.absence_reason` / `notes_by` /
  `notes_at`, and the `(operator_id, log_date DESC)` index all exist. The
  `supabase/migrations/20260921130000_…` path named in the 1335 report does not exist in
  the repo. Its staged copy must NOT be applied a second time. Two optional tidy-ups now
  belong to that session: the `dispatchDayLogs.ts` fallback is dead on the happy path, and
  the staged-column allowance in `postgrestEmbeds.test.ts` can go once the generated types
  carry the three columns.
- NOTE — the absence-reason fallback in `src/lib/dispatchDayLogs.ts` is
  self-clearing: once the staged migration is accepted the full select succeeds
  and the retry path is never taken. It can be deleted at any later tidy-up.

## 2026-09-21 16:20 UTC

### Announcement approval is staged, not proven (2026-09-21)
`release_notes` gains a review workflow (draft/pending/approved/denied/archived), an
audience (`target_roles`), a "Got it" flag, a screen link, and a `release_note_reads`
table. Delivery moves off INSERT onto the transition into `approved`, and
`release_note.approve` is owner-only through the `has_permission` short-circuit.
All of it is STAGED in the draft: nothing exists in the live database yet, so the
refusal of an approval by a non-owner has no live proof.

TRIGGER. First pass after the draft is accepted: raising transactions, real
sessions — Mae submits, Leo is refused, Marcus approves a throwaway row addressed to
no real audience. Also confirm the old all-staff AFTER INSERT trigger is gone.

### Announcements still have exactly one channel (2026-09-21)
The email path (`send-release-note`), the `release_note` bell type and the Staff Help
ingest were deliberately NOT touched. The ingest indexes every announcement row; once
the schema lands it should be narrowed to `status = 'approved'` so a pending or denied
draft is never quoted back to staff by the assistant.

TRIGGER. Same pass as above.

## 2026-09-21 19:30 UTC

### CLOSED — suite reconciliation after the 2026-09-21 draft acceptances
The 14 failures carried from the 1820 report are reconciled. Nine were stale tests reading
migration paths that no longer exist, and they are fixed to read through the shared migration
reader. `release_note_reads` is registered in both tenancy inventories. Every inventory touched
was proven still to bite. See `docs/passes/2026-09-21-1930-suite-reconciliation.md`.

### OPEN — `notify_staff_on_release_note` is unpinned and its notification insert is bare
Belongs to the What's New announcement approval feature (other session). The function is
SECURITY DEFINER with `search_path=public` (must be `public, extensions`) and holds a raw
`INSERT INTO public.notifications` with no EXCEPTION handler — the exact shape that once rolled
back weeks of coordinator saves. Client EXECUTE is correctly absent. Three guard assertions are
RED on purpose and must not be allowlisted.

TRIGGER. That session's next pass. One migration: `ALTER FUNCTION ... SET search_path = public,
extensions;` and route the insert through `public.try_notify(...)`.

### OPEN — the Applications page half of archived applicants is missing
Belongs to the archived-applicants feature (other session). The 1530 report describes
`StatusFilter`, the Archived tab, the `?status=archived` whitelist, `handleArchive`,
`handleUnarchive` and the neutral `bg-muted` colour in `ManagementPortal.tsx`. None of it is in
the repository and `git log -S"handleUnarchive"` finds no trace that it ever was. The enum, the
50-row backfill, the pipeline write and the review drawer ARE live, so today an applicant
archived from the pipeline shows on no tab at all. Five assertions RED on purpose.

TRIGGER. That session's next pass: restore the Applications-page changes. The tests already
describe exactly what is expected.

### CLOSED 2026-09-21 20:30 — both defects above are fixed
This session took them over (the other session is paused).

- `notify_staff_on_release_note()` is pinned `public, extensions` and each notice now goes
  through `public.try_notify(...)` — migration `drizzle/migrations/0025_release_note_notifier_pin_and_isolate.sql`.
  Proved in a rolled-back transaction: one notice refused with 42501, the announcement still
  approved, sixteen other notices landed, the failure recorded in `audit_log`.
- The Applications page half of archived applicants is built: Archived tab with its count,
  `?status=archived`, `handleArchive` / `handleUnarchive` (neither sends email, both audited),
  neutral `bg-muted` colour, drawer wired. Proved on screen as Mae — 50 archived rows, a
  throwaway applicant archived and brought back, `email_send_log` empty for it, row deleted.

Report: `docs/passes/2026-09-21-2030-teammate-defects-fixed.md`.

## Permissions slice 2 — money actions (2026-09-21 2100, part one BUILT 2026-09-21 2317)

- Owner decisions P20-P26 and the seven-row enforcement inventory are recorded in
  `docs/tms-build-status.md` under **2026-09-21 21:00 UTC**; report
  `docs/passes/2026-09-21-2100-money-permissions-inventory.md`. **That report's P21 row and
  its "worst gap" claim are WRONG and carry an appended correction** — no caller, owner
  included, can void a paid dispatch settlement.
- **P21 — DONE (2026-09-21 2317).** P27-P34 recorded; **P28 revised** (a paid settlement is
  never voided by anyone); a draft or approved void now KEEPS every line item and load
  contribution, marked `voided_at`, and a month holds **one LIVE settlement** plus any number
  of voided ones (`dispatch_settlements_company_payee_period_live_uniq`). All seven readers
  name the live row. `settlement.void` registered with no role grant, out of
  `seed_role_permissions`. Report
  `docs/passes/2026-09-21-2317-settlement-void-keeps-record.md`.
- **P26 and P32 — DONE (2026-09-21 2359).** `pay_policy.change` and `driver_pay.change`
  registered with no role grant, out of `seed_role_permissions`; pay policies and assignments
  require `pay_policy.change` on INSERT/UPDATE/DELETE (reads unchanged);
  `ica_contracts.linehaul_split_pct` is owner-only once the agreement is sent for signature or
  later (any status other than `draft`) and `operators.pay_percentage` at all times, both by
  BEFORE UPDATE trigger co-existing with 0023's `aa_` guards. **P32 REVISED and P35 recorded:**
  `contractor_pay_setup` holds no pay at all and is left entirely alone — the 21:00 report's
  claim otherwise carries an appended correction. Migration 0027. Report
  `docs/passes/2026-09-21-2359-pay-rates-owner-only.md`.
- **P36 — DONE (2026-09-22 1100).** The agreement-status bypass of P35 is closed. The builder
  wrote `status: 'draft'` on every update, so staff could save a sent agreement back to draft
  and then change the owner-only percentage freely (proved live: both steps accepted as Leo).
  Fixed on both sides: the builder writes `status` only when creating an agreement, and
  migration 0029's `ab_guard_ica_status_forward_only` refuses any backward status move unless
  the caller holds `driver_pay.change`. Report
  `docs/passes/2026-09-22-1100-agreement-status-forward-only.md`.
- **Signed-agreement mismatch flag — PROVEN ON SCREEN (2026-09-22).** The Pass 5 throwaway was
  refused by `stamp_tenant_company_id()` (42501: "the caller holds no company_members row and no
  server-side company was named"); this pass created the throwaway driver while impersonating the
  owner's session, so the company resolved normally. With a signed agreement at 65% against a 72%
  effective rate, the Linehaul Pay card showed "Agreement mismatch. The signed agreement says 65%;
  the effective pay rate is 72%. Settlements pay 72% from the company rate sheet." and the staff
  settlement review showed "Agreement mismatch — review before money moves." before any money moved.
  Setting the agreement to 72% cleared both. A mismatch means **the driver is being paid something
  other than what he signed**; the flag prompts the owner to correct one or the other, and which
  number pays was not changed. Throwaway removed with zero residue. Report
  `docs/passes/2026-09-22-2020-mismatch-flag-proven.md`.
- **Per-driver pay — COMPLETE, five passes DONE (2026-09-22 1925).** P37-P42 are built end to end:
  the staff-side driver record has the Linehaul Pay card with current rate, effective source, dated
  history, owner-only change flow through `set_operator_linehaul_pct()`, and signed-agreement mismatch
  warnings; Management → Settlement Settings has company rate-sheet versions beside the fuel discount
  pass-through setting and opens new versions through `open_pay_policy_version()` with carried-forward
  unchanged rates; new ICA drafts prefill from the driver's effective rate while sent agreements stay
  locked; staff settlement review warns before money moves and shows each stored line's rate record
  (`resolved_pct`, `pct_source`, `pct_version_id`) or `not recorded` for older nullable lines; driver
  settlement screens still expose no percentages. The two function-reachability AWAITING entries were
  removed and the ceiling lowered by two. Screen proofs covered Marcus, Mae, onboarding-only, Leo, and
  Steve in the driver app. No real driver or company rate changed: 157 backfill rows remain closed,
  0 current driver versions, the current company linehaul rate remains 72, and paid settlement
  `f77911b0` remains untouched. Report `docs/passes/2026-09-22-1925-per-driver-pay-pass-5.md`.
- **Per-driver pay — PASS 3 of 5 DONE (2026-09-22 1615).** Each driver's **linehaul
  percentage** is now its own dated history (`operator_linehaul_pct_versions`, migration 0040):
  append-only, one current version per driver, management/owner read only — a driver never sees a
  percentage. Backfilled 157 versions at 72.00, 0 mismatched against the `operators.pay_percentage`
  mirror the forecast reads. One owner-only writer, `set_operator_linehaul_pct()`: `driver_pay.change`,
  a reason required, no back-dating, closing the old version and opening the new one in one statement;
  the mirror is written only when the new rate has already started, and a nightly job catches a
  future-dated change up on its start date. Settlements pay **linehaul** from his version, resolved
  against the work week being settled, never against today (P38, P41) — only that one column, so
  detention, FSC, TONU, lumper, stop-off, per-ton and loadout still follow the company version
  company-wide. Proved in a rolled-back transaction: 82% from next Wednesday accepted, this week and
  the past week still 72, Mae and Leo refused, a missing reason refused, back-dating refused, a delete
  and an in-place edit refused, a second current version refused. Nothing moved: `f77911b0` still
  327.94, dispatch 100/100/72, all 157 records still 72. **Open question for the owner:** with every
  driver holding a backfilled version, a future company-wide LINEHAUL change reaches nobody — his own
  version wins. Other rates are unaffected. **Still owed in Pass 5:** the Linehaul Pay card on the
  staff driver page and the company pay policy screen; both `AWAITING` allowlist entries come off then.
- **Per-driver pay — PASS 2 of 5 DONE (2026-09-22 1445).** The company pay policy is now
  **versioned**: a rate is never edited in place — a change closes the current version and opens a new
  one from a date, and a past work week is always calculated with the rate that was in force for it
  (P41). `pay_policies_single_company_default` is re-scoped to **current** versions only, so history
  can accumulate while the carrier still has exactly one live default. An append-only guard freezes
  every percentage on an existing version, refuses to re-open or back-date a closed one, and refuses
  DELETE for everyone including the owner — while `fuel_discount_passthrough`, name, description and
  is_active stay in-place edits, so the Settlement Settings toggle keeps working untouched (P40,
  proved: toggled on and off, 2 → 2 versions). Opening a version is one owner-only statement,
  `open_pay_policy_version()`, because two separate writes would leave the carrier with **no current
  pay policy** in between and a settlement resolving that moment would stop. The rehearsal caught a
  real defect first: the RPC stamped an auth user id into columns that reference `profiles(id)`, so it
  could never have opened a version — fixed in 0039 before anyone met it. Proved with real sessions in
  a rolled-back transaction: a second current default refused, Marcus's v2 accepted (82% from
  2026-09-30) with the resolver handing 72 up to 2026-09-29 and 82 after, Mae's and Leo's attempts
  refused loudly, deletes refused, back-dating refused. Nothing moved: settlement `f77911b0` still
  paid 327.94 on 1 line, dispatch verdicts still 100 / 72 / 100, all 157 driver records still 72.
  **Pass 3** puts the percentage card and the dated change form on the staff driver page. Report
  `docs/passes/2026-09-22-1445-per-driver-pay-pass-2.md`.
- **Per-driver pay — option (c) CHOSEN; PASS 1 of 5 DONE (2026-09-22 1400).** Every

  pay-rate reader now resolves the pay-policy **version in force on the date it is asking about** —
  the driver run against its work week, the dispatch run against its month, screens and hints
  against today — through one resolver stated twice and only twice: `public.company_pay_policy_on()`
  in the database and `src/lib/payPolicyVersion.ts` in the app. `pay_policies` gained nullable
  `effective_from` / `effective_to`; the one live row was backfilled to `effective_from 2000-01-01`
  with `effective_date` untouched and `effective_to` NULL. The single-default index is deliberately
  **not** re-scoped yet — that is Pass 2. Proved against a throwaway second version inside a rolled
  back block: the resolver hands 72 to every date up to 2026-09-29 and 82 from 2026-09-30, while the
  reads this pass replaced would have **thrown** (an undated `.maybeSingle()` matched 2 rows) or
  shown a **future** rate (`ORDER BY effective_date DESC LIMIT 1` picked the not-yet-started
  version). Nothing moved: settlement `f77911b0` still paid 327.94 on 1 line, the dispatch verdicts
  still 100 / 72 / 100, Steve Figueroa still 72 and active, all 157 driver records still 72. Guard
  added: `pay-policy-dated-readers.test.ts` forbids any module but the resolver from reading the
  company default. **A second policy version may now be created** — Pass 1 was the gate, and it is
  green. Report `docs/passes/2026-09-22-1400-per-driver-pay-pass-1.md`.
- **Per-driver pay — DESIGNED, awaiting the owner's choice of option (2026-09-22 1345).** The two
  P31 questions are answered: **P41** versions the percentages only (the fuel pass-through stays an
  in-place setting) and re-scopes `pay_policies_single_company_default` to current versions, as P34
  did for dispatch settlements. New decisions recorded: **P37** a driver's percentage is set on his
  staff-side driver page, owner only; **P38** settlements pay his linehaul from his percentage and
  every other rate from the company policy; **P39** the agreement builder pre-fills from the driver
  page and a disagreement is flagged, never silently paid; **P40** the fuel pass-through stays in
  Settlement Settings, unchanged. Counted live: every percentage is **72** on all three tables
  (65 agreements, 157 driver records, 1 policy). **Recommended option (c):** versioned
  `pay_policies` plus a **linehaul-only** dated driver override, `operators.pay_percentage` kept as
  the current value. Rejected (a) a standalone driver history table (second source of pay truth) and
  (b) 157 per-driver copied policies (a later company detention change would not reach a driver).
  Five build passes, in order: date-test all eleven readers first → version the company policy →
  the driver linehaul version table → record the rate and its source on `settlement_line_items` →
  the screens. **Nothing built.** Report
  `docs/passes/2026-09-22-1345-per-driver-pay-design.md`. Superseded blocked entry kept below.
- **P31 versioning — BLOCKED on two owner answers (2026-09-22 1230), not built.** `pay_policies`
  still has no effective-date history, and a driver's percentage lives in TWO places (the
  agreement and the driver record) with nothing keeping them in step. The pass stopped at the
  design step because the owner's design contradicts the live system twice: (1) the unique index
  `pay_policies_single_company_default` allows only ONE company-default row, so a new version
  cannot be inserted without re-scoping it to current versions as P34 did for dispatch
  settlements; (2) "never updated in place" contradicts the shipped Fuel Discount Passthrough
  screen, which updates `pay_policies.fuel_discount_passthrough` in place. **The two questions:**
  which columns are versioned (percentages only, recommended — or the whole row?), and may the
  index be re-scoped? Recorded finding that shrinks the work: dispatch settlements ALREADY store
  the rate they used (`resolved_pct`, `pay_policy_id`); driver `settlement_line_items` store
  amounts only, so money is frozen but the rate is not recorded and a draft recompute re-reads
  the policy. Also recorded: **eight readers and three definer functions take the company default
  with `.maybeSingle()` or `LIMIT 1` and no date test**, so a second version breaks or silently
  mis-resolves every one of them. Report `docs/passes/2026-09-22-1230-pay-policy-history.md`.
- **Test harness, grant parity — CLOSED (2026-09-22 1230).** The EXECUTE grant the harness needs
  was being lost because the sandbox drops and recreates its role. Migrations 0032/0033 add
  `regrant_sandbox_parity_execute()`, re-granted hourly by cron and executable by no client role.
  Known cost: for up to an hour after a recreation `grant-parity-live` is red; it must never be
  gated or allowlisted. `share-token-throttle` was never failing — it passes 8/8 and its banner
  is a deliberate refusal to burn a real QR sticker's throttle allowance.
- **Owner pending-announcement alert — defect fixed (2026-09-22 1230).** Migration 0031 inserted
  the notification bare, so a failed alert could abort the owner's own update; 0033 routes it
  through `try_notify`.
- Superseded description of P26, kept for the record: **the remaining real gap was:** management can change pay policy rates while
  `contractor_pay_setup` accepts ANY staff role, and `pay_policies` has no effective-date
  history. The owner has now answered its hard cases: **P31** a pay-policy change never
  reaches settlements already calculated (effective dates), **P32** `contractor_pay_setup`
  stays an onboarding entry with later changes owner only.
- Still to name after that: **P22** needs dispatcher added to `create_invoice` and to three ALL
  policies together; P20, P23, P24, P25 match on who and need naming only; **P23's action does
  not exist in the code at all**. **P30** settles the -A1 question: a late accessorial is a P24
  approval and dispatch keeps it. **P33** limits dispatch to ISSUING invoices.
- Nothing in the money layer is protected by the UI alone — unlike slice 1, the gaps are
  wrong-role and unnamed-action, not absent enforcement.
