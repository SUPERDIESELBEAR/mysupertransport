# Pay-policy history (P31) — STOPPED at Step 2; Steps 1, 5 and 6 delivered (2026-09-22 12:30 UTC)

Nothing real was changed: no pay policy, assignment or settlement was touched, even briefly.
No probe was needed, because **Steps 3 and 4 were not built** — Step 2 ends in two
contradictions with the live system that only the owner can settle, and the brief's own
instruction is to stop rather than build the heavier design on a wrong premise.

Delivered this pass: Step 1 (how pay resolves today, read live), Step 5 (the missing record
entries — **two** were missing, not one), Step 6 (the test harness, fixed lastingly), Step 7
(read-only, and it is too early — see below).

---

## Step 1 — how pay is resolved today, before any change

| Question | Live answer |
| --- | --- |
| The policy table | `pay_policies`: **1 row**, `SUPERTRANSPORT Standard`, company default, active, `effective_date` **2026-08-18**, all percentages at the recorded defaults (72 linehaul/FSC/TONU/stop-off/per-ton/loadout/other, 100 detention/layover/lumper). |
| Assignments | `pay_policy_assignments`: **0 rows**. The table already carries `effective_start_date` / `effective_end_date`. |
| Settlements in existence | **1 driver settlement** (`f77911b0`, period 2026-08-12 → 2026-08-18, status **paid**, gross = net = **327.94**, 1 line item) and **1 dispatch settlement** (3 charge verdicts). |
| How a driver settlement finds its rate | `src/lib/settlementRun.ts:187-224` — company default read as `.eq('is_company_default', true).maybeSingle()` (**no date test at all**), plus every assignment row, kept when its dates overlap the **work period**. Driver assignment first, company default second. |
| How a dispatch settlement finds its rate | `src/lib/dispatchSettlementRun.ts:111-141` — identical shape, overlap tested against the **month start**. |
| The screens | `payTreatment.fetchEffectivePayPolicy` — assignment effective **today**, else the company default ordered by `effective_date DESC LIMIT 1`. Used by `LoadChargesCard` and `RevisedRateConModal`. |
| Definer functions that read the policy | `driver_load_pay_estimate` (reads a whole policy row, `v_today` = Chicago today), `create_accessorial_adjustment` (company default, `ORDER BY effective_date DESC LIMIT 1` — prices the classification), `my_fuel_transactions` (`is_company_default LIMIT 1` — the discount-passthrough flag), `compute_dispatch_settlement` (persists what the client resolved), `set_operator_fuel_discount_passthrough`. |
| Where the agreement / driver-record percentages enter the pay math | **Nowhere.** Neither `ica_contracts.linehaul_split_pct` nor `operators.pay_percentage` is read by any settlement path. Every settled figure comes from `pay_policies`. `operators.pay_percentage` is read only by the driver's earnings forecast. This is the two-places problem recorded on 2026-09-21, now with its consequence named: **the contracted percentage in the agreement the driver signed does not pay him.** |

### Do settlements store the rate they were calculated with?

**Split, and this is the finding that changes the size of the pass.**

- **Dispatch settlements: YES.** `dispatch_settlement_charge_verdicts` stores `resolved_pct` and
  `pct_column` for every charge, and `dispatch_settlement_load_contributions` stores
  `pay_policy_id`. A later policy change cannot alter a computed dispatch settlement, and the
  percentage used is auditable per charge.
- **Driver settlements: NO.** `settlement_line_items` holds `line_type, amount, description,
  source_table, source_id` — **no percentage, no `pay_policy_id`**. The money is frozen (the
  amounts are stored, and `enforce_settlement_immutability` refuses changes once paid), so no
  past payment can move. What is **not** recoverable is *which* percentage produced it, and a
  **recompute of a draft re-reads the policy as it stands at that moment**.

So P31's first half — "a pay-policy change never reaches settlements already calculated" — is
already true for money. What is missing is the *record* of the rate on driver settlements and
the ability to date a change.

---

## Step 2 — STOPPED. Two contradictions and one consequence

### A. The design cannot insert a second company-default version as written

Live index:

```
CREATE UNIQUE INDEX pay_policies_single_company_default
  ON public.pay_policies (company_id, is_company_default) WHERE is_company_default
```

**One** company-default row per company, full stop. "A change inserts a NEW version" is refused
by this index for the only policy that exists. Versioning the company default therefore requires
re-scoping that index — the same move the owner authorised for dispatch settlements in P34
(`WHERE ... AND effective_to IS NULL`, so one *current* default per company and any number of
closed versions). Reasonable, precedented, and **not in the brief** — so it is the owner's call,
not mine.

### B. "A pay policy row is never updated in place" contradicts a shipped screen

`src/components/management/FuelDiscountPassthroughSettings.tsx:117` **updates `pay_policies` in
place today**, writing `fuel_discount_passthrough`. That is not a rate at all — it is a policy
switch the management screen toggles, and `my_fuel_transactions` reads it to decide whether a
driver may see a fuel discount. Under the blanket rule, that toggle either stops working or has
to mint a whole new policy version, which contradiction A forbids.

A rule that says "never updated in place" therefore has to name **which columns are versioned**.
My proposal, for the owner to accept or reject: the **percentages** are versioned (the money),
and `fuel_discount_passthrough`, `name`, `description`, `is_active` stay in-place updates
requiring `pay_policy.change`. Otherwise a fuel-visibility switch silently rewrites the pay
history.

### C. Consequence the brief does not cover: every reader breaks quietly

Six of the eight readers above take the company default with `.maybeSingle()` or `LIMIT 1`, with
**no date test**. The moment a second version exists:

- `.maybeSingle()` (both settlement run layers) **errors** on two rows — the settlement run stops;
- `LIMIT 1` without an order (`my_fuel_transactions`) picks an **arbitrary** version;
- `ORDER BY effective_date DESC LIMIT 1` (`create_accessorial_adjustment`, the screens) picks the
  **newest** version, including one dated in the future — which is precisely the 75%-from-October
  case in Step 4 leaking into today's screens.

That is eight readers plus three definer functions to change, and the failure mode of getting one
wrong is a wrong percentage that looks right — the shape this project has recorded several times
($204 settlement, $0 loadout, the recurring deduction charged once).

### D. Version one's start date

The one policy's `effective_date` is **2026-08-18**, which is *after* the start of the only
settlement that exists (2026-08-12). "Far enough back to cover every settlement" therefore means
backdating. I would **not** edit that real row's `effective_date`: I would add a separate
`effective_from` column and backfill it to `least(effective_date, earliest settlement
period_start, '2000-01-01')`, leaving the existing column and every current reader untouched. No
real value changes, and version one covers everything by construction.

### The two questions for the owner

1. **Which columns are versioned** — percentages only (my recommendation), or the whole row
   including the fuel-discount switch?
2. **Re-scope `pay_policies_single_company_default`** to current versions only, as P34 did for
   dispatch settlements — yes or no?

With those two answers the build is straightforward and I will do it in one pass: add
`effective_from` / `effective_to`, an append-only guard requiring `pay_policy.change` (the only
permitted update on a closed version being its `effective_to`), a delete refusal for everyone,
date-resolution in all eight readers and three definer functions against the **work week** rather
than today, `pay_policy_id` plus the resolved percentage recorded on driver settlement lines so
they match dispatch, and P37 recorded.

**Step 3 and Step 4 are not built, and nothing was proved on a throwaway row, because building
either design before these answers would mean re-opening it afterwards.**

---

## Step 5 — the missing record entries (DONE)

`docs/tms-build-status.md` was missing **two** passes, not one: the 2026-09-21 23:59 pay-rates
pass (P26, P32 REVISED, P35) as well as the 2026-09-22 11:00 P36 pass. Both are now appended,
dated, unchanged from the reports they cite, and each marked as recorded late.

---

## Step 6 — the test harness, fixed lastingly (DONE)

**First, the brief's premise is half wrong.** `share-token-throttle` does **not** fail. Verbatim:

```
 ✓ src/test/share-token-throttle.test.ts (8 tests) 14055ms
```

It prints a boxed banner saying the end-to-end resolve did not run — by design, because driving
the throttle for real would burn a real roadside QR sticker's hourly allowance. That banner is
not a failure and the file is green. Only `grant-parity-live` failed, on one test:

```
 FAIL  src/test/grant-parity-live.test.ts > live grant / policy parity > no public table admits a role its grants do not
Error: Command failed: psql -At -c select ... from public.grant_parity_report() order by 1
ERROR:  permission denied for function grant_parity_report
```

**Diagnosis.** The grant was **lost, not mis-made**. The harness connects as the bare role
`sandbox_exec` (`current_user` = `session_user` = `sandbox_exec`). The live ACL read:

```
{postgres=X/postgres,service_role=X/postgres,sandbox_exec_qgxpkcudwjmacrdcyvhj=X/postgres}
```

Migration 0004 granted to `sandbox_exec` and 0008 re-granted it with a quoted identifier, and it
read `true` at the time. The bare role is now absent from the ACL entirely, so the sandbox
**dropped and recreated** it in between — a grant is attached to a role OID, and the OID was
replaced. Any one-shot `GRANT` in a migration will be lost again the same way.

**Fix (migration 0032), and why it survives recreation.**
`public.regrant_sandbox_parity_execute()` — SECURITY DEFINER, owned by `postgres`, pinned
`search_path` — grants EXECUTE on `grant_parity_report()` to the **literal** sandbox harness roles
(`sandbox_exec`, `sandbox_exec\_%`) and to nothing else, skipping any that already hold it.
`grant-parity-live.test.ts` calls it, in a named assertion of its own, **before** it reads the
report. The next role recreation therefore costs nothing instead of turning the file red.

Why this weakens neither test:

- `grant_parity_report()` keeps its own ACL. It is **never** granted to `anon`, `authenticated`
  or `PUBLIC`, and must not be — it reads every table's grants. The parity assertion is
  byte-for-byte unchanged and still goes **red**, not skipped, if the report cannot be read.
- EXECUTE on the re-grant function *is* public, which is safe because calling it **can grant
  nothing to its caller**: the role list is literal. An `anon` caller gains no privilege.
- Granting these two roles anything is not an exposure in the first place: both have
  `rolbypassrls = true`, so they already read every row of every table. A read-only report of who
  holds which grant adds nothing.
- `share-token-throttle` is untouched; its deliberate refusal to execute the resolver stands.

Rejected alternatives, recorded: an **event trigger** on role creation (event triggers do not
fire for global objects, and `CREATE ROLE` is global); `SET ROLE service_role` from the harness
(`ERROR: permission denied to set role "service_role"` — no membership, and `sandbox_exec` is not
a superuser); a **per-minute cron re-grant** (1,440 database runs a day to serve a test, and it
still leaves a window); granting to `PUBLIC` (forbidden).

Verified after the fix:

```
 ✓ src/test/grant-parity-live.test.ts (4 tests) 5564ms
   ✓ EXECUTE is restored to the harness role after a sandbox recreation
   ✓ grant_parity_report() exists and is readable from the catalog
   ✓ no public table admits a role its grants do not
   ✓ parser_diagnostics is written only through the definer RPC
```

The report returns **zero offenders**: no public table admits a role its grants do not.

---

## Step 7 — idle-operator dedup: TOO EARLY

The pass ran at **12:20–12:35 UTC**, and `notify-idle-operators-daily` is scheduled `0 15 * * *`.
It has **not run today**. Per the brief's own instruction this reading is skipped and must be
taken after 15:05 UTC; the expectation stands at 0 new `operator_idle` notifications against the
72 sent on 2026-09-21.

---

## Files this pass authored

- `drizzle/migrations/0032_sandbox_parity_execute_self_heals.sql`
- `src/integrations/supabase/types.ts` (regenerated from the new schema)
- `src/test/grant-parity-live.test.ts` (self-healing re-grant assertion added; existing
  assertions unchanged)
- `docs/tms-build-status.md` (the two missing entries: 2026-09-21 23:59 and 2026-09-22 11:00)
- `docs/tms-wish-list.md` (P31 blocked pending the owner's two answers; harness item closed)
- `docs/passes/2026-09-22-1230-pay-policy-history.md` (this file)

**No migration touching `pay_policies` or `pay_policy_assignments` was written.** P37 is **not**
recorded, because the design it would record is unsettled.

## Suite, typecheck, deploy

`bunx tsgo --noEmit`: **clean**.

Full suite, `--maxWorkers=2`, verbatim: see the block appended below.

**Deploy:** migration 0032 was applied to the single Cloud instance that serves both preview and
the published app, so it is live by application; confirmed by `has_function_privilege` reading
`true` for the harness role and by the four green assertions above. No edge function changed, no
client behaviour changed — the only application-code change is inside a test file.

---

## Full suite, verbatim (first run, 12:28 UTC)

```
 Test Files  5 failed | 208 passed | 2 skipped (215)
      Tests  5 failed | 2138 passed | 16 skipped (2159)
     Errors  2 errors
   Start at  12:28:13
   Duration  586.93s
```

Five failures. **Three were mine, one was a real defect I had shipped the day before, one was
infrastructure.** None was allowlisted.

### 1-3. My own 0032 grant, refused by three standing guards (FIXED, migration 0033)

0032 granted EXECUTE on `regrant_sandbox_parity_execute()` to `PUBLIC` so the test could heal its
own privilege. Three guards refused it:

```
 FAIL  definer-live-catalog > no NEW SECURITY DEFINER function is executable by anon
 FAIL  definer-live-catalog > no NEW SECURITY DEFINER function is executable by authenticated
  public.regrant_sandbox_parity_execute()

 FAIL  function-reachability > every client-executable function has a caller somewhere
  public.regrant_sandbox_parity_execute() is EXECUTABLE by a client role but nothing calls it.
```

They were right and my reasoning was wrong. I had argued the public grant was safe because the
function "can grant nothing to its caller" — true, but beside the point: a SECURITY DEFINER
function executable by `authenticated` is executable by the whole driver population, and this
project's rule is that such a function is closed unless it is a token-gated public endpoint.
The reachability guard's own message says allowlisting a finding "is the class that has cost this
project the most", so allowlisting three of them to keep my design was not available.

**0033 withdraws the grant** (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`) and schedules the
re-grant **hourly** instead (`regrant-sandbox-parity-execute`, `0 * * * *`, 24 runs a day).
Checked first for a cadence-free alternative and there is none: `pg_auth_members` shows both
sandbox roles belong to **no group**, so there is no persistent group role to grant to; default
privileges do not reach a role that does not yet exist; event triggers do not fire for
`CREATE ROLE`. Nothing in the database observes the recreation, so a privileged session on a
schedule is the only in-database mechanism. **The cost of the hourly cadence, stated plainly: for
up to an hour after a role recreation `grant-parity-live` goes red.** That is a red test, never a
data risk, and the test file now documents it with an explicit instruction not to gate, skip or
allowlist it — re-run after the hourly job, or apply the grant in a migration.

The test's self-call was removed with it. Post-fix, verbatim:

```
 ✓ src/test/grant-parity-live.test.ts (3 tests)
 ✓ src/test/definer-live-catalog.test.ts (13 tests)
 ✓ src/test/function-reachability.test.ts (4 tests)
```

### 4. A real defect I shipped on 2026-09-21: the owner's alert could abort his own update (FIXED, 0033)

```
 FAIL  notification-isolation > every notification insert outside try_notify is isolated
  "public.notify_owner_on_pending_release_note() (1 in drizzle/0031_notify_owner_pending_release_note.sql)"
```

Migration 0031 — the owner's pending-announcement bell, applied yesterday — used a bare
`INSERT INTO public.notifications`. That is **the same defect the 2026-09-21 20:30 pass fixed for
`notify_staff_on_release_note()`**, reintroduced by me in the very next notifier. In an
`AFTER INSERT` trigger a bare insert means one bad notification row (a constraint, a null
recipient) aborts the whole transaction: **the owner's update would fail to save because telling
him about it failed.** 0033 routes it through `public.try_notify(...)`, which records a delivery
failure and returns false instead of raising. Nothing else about the alert changed.

### 5. Infrastructure, not a defect

```
 FAIL  billing-schema > create_invoice is the only invoice writer, and the allocator serves only it
psql: error: connection to server at "aws-0-us-west-2.pooler.supabase.com" ... port 6543 failed:
FATAL:  (EAUTHQUERY) auth_query secret check timed out
```

Pooler saturation at `--maxWorkers=2`, the standing limitation recorded on 2026-09-21. The file
passes on its own. The two `Timeout calling "onTaskUpdate"` unhandled errors are the same
condition in the vitest worker RPC.

### Also fixed: a test with a shelf life

`release-note-approval.test.ts` read the 0031 migration from its **staging path** under
`.lovable/drafts/.../migrations/`. That path vanished when the draft was accepted, so the file
failed outright with `ENOENT` — it was asserting against a file that no longer existed. It now
reads the applied `drizzle/migrations/0031_...` plus `0033_...`, and a new assertion holds the
`try_notify` routing so this defect cannot come back a third time. 21 tests pass.

`bunx tsgo --noEmit`: clean after every change above.

## Files this pass authored (revised)

Add to the list above:

- `drizzle/migrations/0033_harness_regrant_hourly_and_owner_notice_isolated.sql`
- `src/test/release-note-approval.test.ts` (applied-migration paths; `try_notify` assertion)
