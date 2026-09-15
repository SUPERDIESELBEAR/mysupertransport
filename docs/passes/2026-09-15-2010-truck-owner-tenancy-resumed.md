# Truck owner tenancy — sections 2, 3 and 4

Build mode. 2026-09-15 20:10 UTC. Immutable: append only.

Resumes the pass that stopped at 19:15
(`docs/passes/2026-09-15-1915-truck-owner-tenancy-stopped.md`). Section 1 was
skipped: `truck_owners` already had `company_id`, NOT NULL, FK RESTRICT, stamped,
zero NULLs, from the B5 Group C migration at 00:41 the same day.

## 1. The derivation disagreement — closed

The 19:00 decision governs the RESOLVER, not the backfill: the resolver must read
`truck_owners.company_id` DIRECTLY, so an owner between hires still resolves.
That is what was built. How the five existing rows got their value is a one-time
question — derived from the parent operator, one carrier, every value correct —
and `invite-truck-owner`, the only writer, names the company explicitly, so no
new row derives. The two methods could diverge only if an owner's drivers
belonged to a different carrier than the owner, which the one-carrier simplifying
assumption rules out. Recorded in `docs/tms-build-status.md`; not left open.

## 2. The ninth source-citation instance

Mine, and of a NEW variety. The 18:45 B6 Group 2 report and the 19:00 decision
record both called `truck_owners.company_id` future work; it had existed since
00:41 and the B5 Group C report says so plainly. The previous eight were claims
about CODE or DATA made without a query. This was A CLAIM ABOUT WORK ALREADY DONE
AND RECORDED, made without reading the record — a pass report written and then not
read by its own author. Same guard, new failure mode.

## 3. What was applied

One migration, applied successfully:

- `current_company_id()` rewritten. Order: `company_members` → the caller's own
  `operators` row → the caller's own `truck_owners` row, each keyed on
  `auth.uid()`, one COALESCE, no `carrier_profile`, still `STABLE SECURITY
  DEFINER` with `search_path = public, extensions`.
- `operator_documents` — nullable `company_id` → backfill from the parent
  operator (1,184 of 1,184) → NOT NULL, FK `ON DELETE RESTRICT`, index,
  `aa_stamp_tenant_company_id`. The standard route was safe here: its only UPDATE
  trigger is `AFTER UPDATE OF deleted_at`, so the backfill UPDATE fired nothing —
  no constant-DEFAULT dodge needed.
- `document_acknowledgments` — same route, person-owned, backfilled by the
  resolver's three sources in order. 365 of 365; zero of the 80 distinct
  `user_id`s failed to resolve.
- Neither table has a unique index other than its primary key, so nothing needed
  rescoping.

Live structure, verbatim (`is_nullable | stamp triggers | FK confdeltype |
company_id default is null`):

```
operator_documents       | NO | 1 | r | t
document_acknowledgments | NO | 1 | r | t
truck_owners             | NO | 1 | r | t
```

Rows pointing off the live carrier: `operator_documents` 0,
`document_acknowledgments` 0. Policies 560. Linter 172 findings, 5 distinct — the
existing baseline, no new distinct finding.

## 4. Code adapted

- `supabase/functions/finalize-passenger-auth/index.ts:196` — the service-role
  `operator_documents` insert now passes `company_id: companyId`, the value it
  already resolved two lines earlier for `driver_vault_documents`. Without this
  it would have raised 42501 the moment the column landed. Redeployed.
- Eight client insert paths wrapped in `insertPayload` so the payload stays
  typed: `DocumentViewer`, `ContractorPaySetup`, `OperatorDocumentUpload`,
  `OperatorStatusPage`, `PEScreeningTimeline`, `SmartProgressWidget`,
  `TruckPhotoGuideModal`, `OperatorDetailPanel`. None sends a company; the server
  stamps it.

## 5. Guards — the held-back block retired in the same pass

`src/test/tenancy-resolver.test.ts`:

- `HELD_BACK` deleted; both tables moved into `B6_DOCUMENTS`, which also feeds
  the one-trigger-name guard, so the stamped-table list now expects 93.
- The resolver guard now asserts THREE sources
  (`['company_members','operators','truck_owners']`), both non-membership
  branches keyed on `auth.uid()`, one COALESCE, no `carrier_profile`.
- A new guard asserts `truck_owners` is read DIRECTLY
  (`t.company_id FROM public.truck_owners t WHERE t.user_id = auth.uid()`) and
  that `public.operators` precedes `public.truck_owners` in the body.
- One guard bug found and fixed while doing this: it read `const [body] =
  psql(...)`, and `psql()` returns ONE ELEMENT PER LINE, so it was matching
  against the single word `CREATE`. It now uses `resolverDef()`, which joins the
  definition. A guard that reads one line of a multi-line function tests nothing.

## 6. Real sessions — the point of the pass

TRUCK OWNER `24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`, owner-only, no
`company_members` row and no `operators` row — the user who resolved to NOTHING
before this pass:

```
GET  operator_documents                 200, carrier-scoped rows
POST document_acknowledgments (bare)    201  company_id=6b54d0e6-…
POST document_acknowledgments (spoofed  201  company_id=6b54d0e6-…  ← OVERWRITTEN
     company_id=00000000-…)
POST operator_documents (bare)          201  company_id=6b54d0e6-…
```

DRIVER Steve Figueroa (`878be880-…`, operator `2c24ca65-…`):

```
GET  operator_documents                 200, carrier-scoped rows
GET  document_acknowledgments           200, carrier-scoped rows
POST document_acknowledgments (bare)    201  company_id=6b54d0e6-…
POST document_acknowledgments (spoofed) 201  company_id=6b54d0e6-…  ← OVERWRITTEN
```

Five scratch rows deleted. Counts back to `operator_documents` 1,184 and
`document_acknowledgments` 365, exactly the pre-pass figures.

## 7. Suites and typecheck

- `npx tsgo --noEmit` — clean, no output.
- `src/test/tenancy-resolver.test.ts` — 91 passed, 1 failed. THE FAILURE IS NOT AN
  ASSERTION. Verbatim:

  ```
  psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com"
  (44.238.118.41), port 6543 failed: FATAL:  (EAUTHQUERY) auth_query secret
  check timed out
  ```

  It hit `no B4 row points off the live carrier` on `broker_contacts`. Run
  directly, that same query returns `0 0`. The known pooler flake, the same one
  the Group C pass recorded; a fully green single run of this file has still not
  been produced, and saying otherwise would be a false claim. An earlier run of
  the same file failed the 19-table B5 check the same way; all nineteen return
  `0 0` when queried directly.
- `policy-grant-parity`, `grant-parity-live`, `definer-search-path`,
  `caller-evaluated-functions`, `operator-fuel-isolation`,
  `operator-settlement-isolation`, `operator-pay-exposure` — 7 files, 33 passed.

## 8. What is NOT established

CROSS-CARRIER ISOLATION. One real carrier exists. Every probe here shows the
column is SERVER-CONTROLLED — spoofs overwritten, bare inserts stamped — not that
a second company's rows would be invisible. That waits on a second company.

## 9. What remains in B6

Group 1 (ELD/RODS, 10) done. Group 2 complete: the two held-back tables are now
migrated. Group 3 — the rest of the driver-written set — untouched, plus the two
no-writer findings: `ica_driver_acknowledgments` (9 rows) and `documents`
(0 rows, dead). B7 (logs) and B8 (token/share) unstarted.
