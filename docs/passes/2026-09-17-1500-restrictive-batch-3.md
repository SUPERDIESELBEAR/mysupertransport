# Pass report — five blind migration readers, and restrictive tenant policy BATCH 3

2026-09-17 1500 UTC. BUILD MODE. Immutable: append corrections, do not rewrite.

Read first, as instructed:
`docs/passes/2026-09-17-1314-drizzle-folder-explained.md`,
`docs/passes/2026-09-17-1235-cleanup-and-batch-2.md`, and
`docs/passes/2026-09-16-1920-restrictive-policy-precheck.md` ("Batch order after
the pilot").

**Nothing in the prompt contradicted the live system or the record.** The final
prompt line (`END OF PROMPT…`) arrived intact; the prompt was not truncated.

---

## 0. Sign-in rule (owner decision 2026-09-17)

Sign in ONCE per test identity per pass, reuse that session for every count and
probe. Five identities were minted once and reused throughout: Marcus Mueller
`5cca4f77-…`, Leo Wallace `7d80cc10-…`, Mae Lauron `2cedd3ac-…`,
Steve Figueroa `878be880-…`, Donald Alleyne `24ee1b9e-…`. No session material
was printed, logged or summarised. One operational note: `/tmp` is cleared
between commands in this sandbox, so session files were kept under `/root/sess`.

## 1. The five blind readers

Each moved onto `migrationSources()` in
`src/test/helpers/migrationFunctions.ts`, which enumerates `supabase/migrations`
then `drizzle/migrations` (Drizzle LAST, so the newest-definition rule still
resolves to the newest text).

| reader | what it checks | proof it reads `drizzle/migrations` |
|---|---|---|
| `resume-token-reuse` | resolved body of `consume_application_resume_token` | new test asserts a `drizzle/` source is enumerated |
| `notification-priority` | `priority` literals vs `notifications_priority_check` | same |
| `settlement-foundation` | forbidden vocabulary walk ("escrow", "holdback") | DEMONSTRATED, below |
| `src/lib/__tests__/settlementRun.test.ts` | `store_settlement_run` refusal rules | new test asserts a `drizzle/` source |
| `verbatimVerificationCard.test.tsx` | envelope keys the migration writes | same |

Focused run of the five files: **81 tests, all passed.**

The vocabulary walk was demonstrated. The first attempt was INVALID and is
recorded as such: `printf` read the leading `--` of a SQL comment as an option,
wrote no file, and the test passed for the wrong reason. Repeated with `echo`
writing `SELECT 'escrow';` to `drizzle/migrations/zz_scratch_vocab.sql`, the
test FAILED naming `/dev-server/drizzle/migrations/zz_scratch_vocab.sql`; the
scratch file was deleted and the test passed again. The platform had
auto-committed the scratch file, so its deletion shows in this pass's history.

The matching OWNER FOLLOW-UP line under VERIFICATION GAPS was removed.

## 2. The batch, chosen live

Candidates: `company_id` present, no `tenant_isolation`, at least one
OWNERSHIP-class permissive policy, NO OTHER-class policy. The full query is
quoted in `docs/tms-build-status.md`, section (c) of the 2026-09-17 1450 entry.

Excluded: realtime-subscribed tables (pre-check section h), financial tables,
`user_roles`, `company_members`, token tables, and every ELD/RODS table —
`blank_log_acknowledgments`, `eld_malfunction_events`, `rods_amendments`,
`rods_correction_requests`, `rods_days`, `rods_divergences`, `rods_events`,
`rods_unlock_events`, `roadside_stops`, `inspection_cycles`, plus the
realtime-excluded `truck_dot_inspections` and `inspection_documents`.

The 25 chosen, visible-row tables first: `document_acknowledgments`,
`driver_vault_documents`, `inspection_binder_order`,
`ica_driver_acknowledgments`, `truck_owners`, then
`operator_offboarding_steps`, `load_stops`, `onboard_assignment_sheet_items`,
`load_documents`, `load_references`, `truck_maintenance_records`,
`load_status_history`, `load_reference_citations`, `notification_preferences`,
`service_resource_views`, `inspection_document_versions`,
`user_view_preferences`, `equipment_receipts`,
`service_resource_completions`, `staff_ui_preferences`,
`operator_broadcast_recipients`, `service_help_requests`,
`document_exceptions`, `documents`, `driver_staff_contacts`.

Remainder: 50 candidate tables, the ELD/RODS set among them.

## 3. BEFORE / AFTER counts

Full table in the build-status entry. **Every count unchanged for all five
identities** (`diff` clean per identity); the STOP condition did not trigger.
The zeros are pre-existing permissive refusals, read the same way before the
migration.

## 4. Migration

`drizzle/migrations/0001_restrictive_tenant_policy_batch_3.sql`, the pilot's
exact policy, 25 statements, nothing else touched.

Live after: public policies **634**, restrictive **74**, `tenant_isolation`
rows **74**. Linter **172**, unchanged, no new finding type.
`npx tsgo -p tsconfig.app.json --noEmit` → exit 0.

CORRECTION: the platform tool again claimed
`src/integrations/supabase/types.ts` was regenerated. `git show --stat
fe2144fc2` does not list it. Second occurrence; the claim is untrusted and
`git` is the record.

## 5. Write test

As Steve Figueroa on `document_acknowledgments` — the driver document viewer,
`src/components/documents/DocumentViewer.tsx:83`: insert without `company_id`
→ `201` stamped `6b54d0e6-…`; insert with a spoofed `company_id` → `201`
**stored as `6b54d0e6-…`**, the stamp overwrote the spoof; update → `200` with
an EMPTY body, nothing changed; update to a random company → `200` empty as
well; cleanup left `document_version IN (901,902)` = 0 and the table back to
365.

**A driver cannot demonstrate the `tenant_isolation` refusal on any batch
table**: no batch table grants him UPDATE (`document_acknowledgments` gives him
INSERT plus SELECT only), and PostgREST reports a zero-row update as `200` —
the pre-existing zero-row-success reporting gap already on the follow-up list.

The refusal was therefore demonstrated on a batch table by the role that can
update one, dispatcher Leo Wallace on `load_stops`, disclosed as an addition:
normal `stop_notes` update → `200`, `company_id` unchanged; `company_id` → a
random company → `403`
`{"code":"42501","message":"new row violates row-level security policy
\"tenant_isolation\" for table \"load_stops\""}`; `stop_notes` restored to its
original `null`; residue `LIKE 'SCRATCH%'` = **0**. One false start recorded:
the first update used `notes` and returned `PGRST204` — the column is
`stop_notes`. The probe was wrong, not the system.

## 6. Driver screens, as Steve in the preview

Chromium 420×1600, Steve's one session restored to `localStorage`:

- `/operator` — ICA signed card, "Welcome, Steve!", 89% / 8 of 9, FULLY
  ONBOARDED, nine stage cards, QPassport card, Truck & Equipment.
- `/operator/documents` — Form 2290 (Schedule-1.pdf), Truck Title (Title.jpg),
  five named truck photos, all Received.
- `/operator?view=my-docs` (`MyDocumentsFolders`, reads
  `driver_vault_documents`) — DOT inspections, CDL front/back, Medical
  Certificate, ICA, Form 2290, plus COMPANY DOCUMENTS (IFTA, Insurance, UCR,
  MC).
- `/operator?view=inspection-binder` (reads `inspection_binder_order`) —
  renders with its documents.

All consistent with the before counts (Steve: 6, 14, 2). Console errors were
only the pre-existing React ref warnings from `App`. Screenshots under
`/tmp/browser/b3/`.

## 7. Guard

`src/test/tenancy-resolver.test.ts`: 25 tables moved from
`PENDING_RESTRICTIVE` (98 → 73) into `RESTRICTIVE_DONE` (49 → 74). Run BEFORE
the edit it FAILED as designed:

```
stale PENDING_RESTRICTIVE entries
+   "truck_owners: declared pending but already carries a restrictive policy",
+   "user_view_preferences: declared pending but already carries a restrictive policy",
+ ]
 ❯ src/test/tenancy-resolver.test.ts:2124:56
```

After the edit: 122 tests, all passed.

## 8. Full suite, verbatim

```
 Test Files  202 passed | 2 skipped (204)
      Tests  2016 passed | 15 skipped (2031)
     Errors  2 errors
   Duration  369.92s (transform 9.62s, setup 93.21s, collect 96.38s, tests 751.02s, environment 482.42s, prepare 76.47s)
```

**No test failed.** The two errors are both
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"` — reporter RPC
timeouts, not assertions, already on the record. No `EAUTHQUERY` failure and no
test timeout occurred, so no re-run was needed.

## 9. Boundary

**CROSS-CARRIER REFUSAL STILL NOT DEMONSTRATED: ONE CARRIER EXISTS.** Proven:
the policy is present and exactly shaped on 25 more tables, it costs the
existing carrier nothing on any of the five identities, the driver's own
screens still render his rows, and one real cross-company refusal
(`42501`, `tenant_isolation`, `load_stops`). Not proven: that a second
carrier's rows would be hidden.

**74** company-bearing tables done, **73** still pending, plus
`company_members` permanently exempt.

## 10. Files changed — `git diff --stat 0b23b403b HEAD`

```
 docs/tms-build-status.md                           | 242 +++++++++++++++++++++
 docs/tms-wish-list.md                              |   5 +-
 .../0001_restrictive_tenant_policy_batch_3.sql     | 124 +++++++++++
 drizzle/migrations/meta/0001_snapshot.json         |  18 ++
 drizzle/migrations/meta/_journal.json              |   7 +
 public/version.json                                |   4 +-
 .../__tests__/verbatimVerificationCard.test.tsx    |  16 +-
 src/lib/__tests__/settlementRun.test.ts            |  13 +-
 src/test/notification-priority.test.ts             |  18 +-
 src/test/resume-token-reuse.test.ts                |  32 +--
 src/test/settlement-foundation.test.ts             |  17 +-
 src/test/tenancy-resolver.test.ts                  |  69 +++---
 12 files changed, 500 insertions(+), 65 deletions(-)
```

`public/version.json` and the two `drizzle/migrations/meta` files were written
by platform tooling, not by hand; they are listed because the standing rule is
that a report lists every file the pass changed, checked against `git`. This
report itself lands in the commit that follows and is the thirteenth file of
the pass.
