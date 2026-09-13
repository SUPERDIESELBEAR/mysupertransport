# The tenancy boundary — design proposal

Read-only. No code, no migrations. Every figure below is from a live catalog query in this
session; the query is named with the claim.

---

## 1. What already has `company_id`, and what does not

**Has it — 8 tables, all NOT NULL, no column default** (`pg_attribute` + `pg_trigger` join):

| Table | Stamping trigger |
|---|---|
| `invoices`, `invoice_line_items`, `invoice_batches`, `invoice_number_config`, `payments`, `factoring_remittances`, `ar_aging_snapshots` | `aa_stamp_billing_company_id` |
| `accessorial_adjustments` | `aa_stamp_company_id` |

Both triggers call the same `stamp_billing_company_id()` — definer, `NEW.company_id :=
public.current_company_id()` with no COALESCE. Nothing outside Module 7 and the accessorial
adjustment table carries the column.

**Does not have it — 185 tables** (`query_to_xml` exact counts):

- 56 hold **zero rows** — free to change.
- 89 hold 1–50 rows.
- 40 hold more than 50 rows, **34,133 rows in total across all 185**.

The largest, in order: `notifications` 10,752 · `dispatch_daily_log` 5,772 · `audit_log`
3,969 · `email_send_log` 2,043 · `dispatch_status_history` 1,466 · `operator_documents`
1,180 · `eld_cron_runs` 1,029 · `driver_vault_documents` 822 · `inspection_documents` 773 ·
`share_tokens` 693. Then the identity core: `applications` 338, `equipment_assignments` 278,
`equipment_items` 219, `user_roles` 182, `profiles` 170, `operators` 154, `onboarding_status`
154. Revenue-layer tables are small: `loads` 17, `load_stops` 35, `fuel_transactions` 69,
`settlements` 1, `invoices` 1.

**The single most important finding.** `current_company_id()` is
`SELECT id FROM public.carrier_profile ORDER BY created_at LIMIT 1` — it does not read
`auth.uid()` at all. `carrier_profile` holds **1 row**. So the stamp is correct today by
accident of there being one company, and the boundary has **no membership input whatsoever**.
Everything in section 3 follows from that.

---

## 2. What `is_demo` does today

Ten tables carry it, not ten of equal weight: `operators`, `applications`, `profiles`, plus
the seven ELD tables `rods_days`, `rods_correction_requests`, `rods_divergences`,
`eld_extension_requests`, `eld_malfunction_events`, `eld_revoked_list_checks`,
`eld_sync_alerts`.

Live demo rows: `operators` **1** · `profiles` **1** · `rods_correction_requests` **3 of 3** ·
every other one **0**. The single demo operator is `8c0ccadb…`, label *ELD Test Harness*,
with **no `application_id`** — so nothing in `applications` is demo, and the three-table
"operator + application + profile" flip that `set-demo-flag` performs has only ever had two
tables to flip for this row. **52 files** reference the column (`rg -c`), across the staff
roster, dispatch board, fleet, equipment, `managementMetrics`, the roadside render, and nine
edge functions including `provision-demo-driver`, `reset-demo-driver`, `set-demo-flag`.

**Proposal: `is_demo` stays for this pass and is retired in its own pass, last.** It is not
the same distinction as `company_id` and should stop being described as one: `is_demo` marks a
*watermarked ELD sandbox record that may never become a real §395.8 log* — an immutability
and export-exclusion rule enforced by `enforce_record_is_demo` and the `set-demo-flag` 409.
`company_id` marks *whose data this is*. The fictitious company subsumes the demo **portal
walkthrough**, not the ELD watermark.

Rejected: retiring `is_demo` in the same pass that introduces `company_id`. It would move 52
call sites and the ELD immutability guarantee while the boundary is still unenforced — and
would delete the only sandbox that currently works, to get isolation that at that moment is
structural only. Also rejected: adding demo semantics to `company_id` (e.g. an `is_demo`
column on `companies`) — the recorded decision is that nothing is marked.

Two mechanisms for one distinction is indeed the shape this project keeps finding defects in.
The answer is to narrow `is_demo` to ELD watermarking and delete its roster/metrics uses once
the fictitious company holds those drivers — a P6 step below, with the trigger being "the
fictitious company has drivers on the roster".

---

## 3. How `company_id` is set, and how RLS uses it

**Membership lives in a new `company_members` table** (`user_id`, `company_id`, unique on the
pair), and `carrier_profile.id` is promoted to the company identity it already de facto is —
no new `companies` table, because `current_company_id()`, the billing FKs and
`invoice_number_config`'s `UNIQUE (company_id, year)` already point at it. `current_company_id()`
is rewritten to `SELECT company_id FROM company_members WHERE user_id = auth.uid()`, definer,
one row, **no fallback to the first carrier row** — an unresolvable user must fail closed, not
silently inherit SUPERTRANSPORT.

Rejected: a JWT claim (client-adjacent, needs an auth hook, and the recorded rule is that
tenancy is never accepted from the client) · a column DEFAULT (already failed live with
`permission denied for function current_company_id`) · `company_id` on `user_roles` (182 rows,
multiple roles per user — ambiguous by construction) · `company_id` on `profiles` (works, but
makes the boundary a mutable field on a table users can update paths into; a dedicated join
table with no user-writable policy is the safer object).

Stamping stays exactly as Module 7 does it: one definer `BEFORE INSERT` trigger per table,
unconditional assignment, `company_id` never in any client payload and never in an
`UPDATE` whitelist.

**RLS scale, from `pg_policy`:** **553 policies** exist in `public`; **8** currently mention
`company_id`. So on the order of **300–400 policies would gain a company predicate** — every
policy on a table that ends up carrying the column, minus the self-scoped operator policies
where `auth.uid()` already implies the company through membership. That number is the reason
section 4 is staged rather than one pass.

---

## 4. The order of work

1. **`company_members` + resolver rewrite.** No other table changes. Out of order: if the
   column lands first, it is stamped from `ORDER BY created_at LIMIT 1` and every backfilled
   row silently gets the right answer for the wrong reason — untestable later.
2. **Nullable `company_id` + stamp trigger on business tables, backfilled to SUPERTRANSPORT,
   in FK dependency order** (parents before children). No policy changes. Out of order:
   NOT NULL before backfill blocks every insert; children before parents leaves rows whose
   parent has no company.
   *Unique keys move with it* — any unique index that must become per-company gains
   `company_id` as the leading column, the `UNIQUE (company_id, year)` precedent. This is
   where the 219-row `equipment_items` serial index is real work and the 56 empty tables are
   free.
3. **NOT NULL, per table, only after a `count(*) WHERE company_id IS NULL = 0` check.**
4. **Create the fictitious company + its members.** Nothing else.
5. **Flip RLS to filter by company, one table group at a time**, each followed by the owner
   access check. Out of order: a global flip while any table still lacks the column, or lacks
   a backfill, locks staff out of their own data — the exact failure the boundary is meant to
   prevent.
6. **Narrow `is_demo` to ELD watermarking** and remove its roster/metrics uses.

**When the boundary becomes enforced:** at step 5, per group, never globally, and never before
that group's step 3 has passed. A column nothing filters on is a *stamp*; the boundary exists
only where a policy reads it. Staging it per group means the answer to "is it enforced?" is
per-table and written down, rather than a single flag day.

---

## 5. What must not break

- **59 active operators, 338 applications, 154 `operators` rows** (live counts — see
  Contradictions), plus ELD and compliance records: steps 2–3 are `ADD COLUMN` + `UPDATE` +
  `SET NOT NULL` only. No row is deleted, no value other than `company_id` is written.
- **69 fuel transactions, the retained settlement, the 1 invoice:** already-immutable rows.
  `company_id` is added *before* any immutability trigger can see it as a change, because the
  backfill runs as a privileged migration, not through the app's UPDATE paths. Each
  immutability trigger's column whitelist must be re-read at that step — a trigger that
  rejects any change will reject the backfill too.
- **The owner:** after every step, the owner sequence check runs — sign in, open Management,
  Dispatch and Staff, confirm the roster count and the settlement are visible. Step 1 is the
  dangerous one: if the owner has no `company_members` row when the resolver stops falling
  back, the owner's own inserts fail. So the owner's membership row is written **in the same
  migration** as the resolver rewrite, not after it.

---

## 6. What cannot be verified

One `carrier_profile` row exists. Until a second does, **every isolation claim is structural**:
that a policy names `company_id`, that a trigger stamps it, that no client payload carries it.
Demonstrable now: the stamp is not client-settable; a hand-asserted `company_id` is overwritten;
`company_id IS NULL` counts reach zero. **Not** demonstrable: that company A cannot read company
B's row — with one company that query has nothing to fail on.

**Create the fictitious company at step 4** — after backfill and NOT NULL, before the RLS flip.
Rejected *early* (step 0): its rows would ride through 185 `ADD COLUMN`/backfill/NOT NULL
migrations, and a backfill that has to distinguish two companies is a different, riskier
statement than one that writes a constant. Rejected *late* (after step 5): the RLS flip is the
one step that genuinely needs a second tenant to be verified rather than asserted, and flipping
it blind is how people get locked out.

---

## CONTRADICTIONS

Two, both worth your read before anything is built:

1. **The brief's figures do not match the live database.** You state 61 active operators and
   326 applications. Live: `operators where is_active` = **59**, `applications` = **338**.
   `fuel_transactions` = 69 and `carrier_profile` = 1 row both match. I have not reconciled
   these — reporting as instructed.
2. **The record describes the boundary as already resolving per user; the live function does
   not.** `current_company_id()` reads the first `carrier_profile` row by `created_at` and
   ignores `auth.uid()`. Nothing about the Module 7 stamping is wrong — with one company the
   value is correct — but "every query is already scoped to the company the user is in" is not
   true of any code path today. If that line was meant as intent rather than current state,
   nothing further is needed; if it was meant as state, it is the defect this proposal's step 1
   fixes.
