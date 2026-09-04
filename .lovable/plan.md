# Design proposal — the accessorial adjustment record (the `-A1` path)

Proposal only. No code, no migrations. Every schema claim below comes from a live
catalog query (`information_schema.columns`, `pg_constraint`, `pg_proc.prosrc`,
`pg_tables`) run against the project database this session, or from current source.

## 1. What already exists that this must connect to

**The `adjustment` line type exists on both sides and has no producer — confirmed.**

- Source: `src/lib/settlementEngine.ts:44-46`
  ```
  export type SettlementLineType =
    | 'load_pay' | 'accessorial' | 'reimbursement' | 'fuel' | 'cash_advance'
    | 'deduction' | 'rm_deposit' | 'carry_forward' | 'adjustment';
  ```
  A repository search for `adjustment` across `src/lib`, `src/components`,
  `src/pages` returns only: this enum member, a comment at
  `settlementEngine.ts:344-345` ("a correction once the ticket lands would be an
  adjustment and no adjustment path exists yet"), and unrelated word matches
  (`ICADocumentView`, `perTonScale`, `invoiceBuilder`, a check-in test). **Nothing
  emits a line with `lineType: 'adjustment'`.**
- Live catalog: `settlement_line_items_line_type_check` permits
  `load_pay, accessorial, reimbursement, fuel, cash_advance, deduction,
  rm_deposit, carry_forward, adjustment`. So the database already accepts the
  line kind.
- Live catalog, and this is the load-bearing constraint for section 3:
  `settlement_line_items_source_table_check` permits ONLY
  `loads, fuel_transactions, deductions, deduction_installments, cash_advances,
  rm_deposits, settlements`. **There is no source table an adjustment could name.**
  Whatever holds the adjustment must be added to that CHECK, because that column
  is what the double-pay guard keys on.

**`assert_charge_entry_allowed`, live body (`pg_proc.prosrc`, single definition in
the catalog):**

```
DECLARE v_uid uuid := auth.uid(); v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT ( public.has_role(v_uid,'management') OR public.has_role(v_uid,'owner')
           OR public.has_role(v_uid,'dispatcher') ) THEN
    RAISE EXCEPTION 'You do not have permission to change charges on a load';
  END IF;
  SELECT status::text INTO v_status FROM public.loads WHERE id = p_load_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Load not found'; END IF;
  IF v_status IN ('invoiced','factored','paid','settled','closed') THEN
    RAISE EXCEPTION 'This load''s money is fixed (%). A late accessorial must go
      through the adjustment path, referencing this load, and land in a later
      settlement.', v_status;
  END IF;
END;
```

It is deflecting to a destination that does not exist. Exactly five statuses are
deflected, and the deflection names three obligations: reference the load, be a
late accessorial, land in a LATER settlement. The proposal below is bounded by
that sentence and nothing wider.

**`load_charges`, live columns:** `id, load_id (NOT NULL), load_stop_id,
charge_type (NOT NULL), description, amount (NOT NULL), source (NOT NULL),
created_at, updated_at, created_by, updated_by, funding_source, actual_cost,
proof_document_id`. Four rows exist today. There is no approval state, no
reference column, no settlement or invoice pointer, and no status. Live
`pg_tables` shows **no** `accessorial_adjustments` and **no** `supplemental_*`
table.

## 2. What an adjustment is

**Proposal: a separate table, `accessorial_adjustments`, one row per late
accessorial.** Shape: `id`, `company_id` (trigger-stamped), `load_id` (RESTRICT),
`reference` (`ST-1042-A1`), `sequence` (int), `charge_type` + classification,
`amount`, `funding_source` / `actual_cost` / `proof_document_id` mirroring
`load_charges` so the pay treatment resolves identically, `status`,
`approved_at` / `approved_by`, `reason` (required), `settlement_id` and
`settlement_line_item_id` once consumed, `invoice_id` / supplemental pointer once
billed, plus the standard actor columns.

**Rejected: a flag on `load_charges`.** It reads cheaper and it is wrong here.
`assert_charge_entry_allowed` gates the whole table by LOAD status, so a late row
would either bypass the guard (removing the only thing protecting fixed money) or
require the guard to branch on the flag — at which point the guard no longer says
one thing. Worse, `load_charges` is read by the shared parts assembler
(`src/lib/loadRateParts.ts`) and therefore by the invoice builder, the driver
engine and the dispatch base; a flagged row would silently change all four the
moment it is entered, before anyone approves it. A separate table means an
unapproved adjustment is invisible to money by construction, not by filter.

**Rejected: reuse `load_change_history` or a note.** It carries no amount and
nothing can pay it.

**Sequence: PER LOAD, allocated on the WRITE.** `ST-1042-A1` is meaningless
globally; the factor reads it as "the first supplement to load ST-1042". Proposal:
`UNIQUE (load_id, sequence)` and the sequence derived inside the writer RPC as
`max(sequence)+1` for that load under the row lock the insert already takes —
the number is a consequence of a successful insert and cannot exist without one.

**Rejected: a mount-effect allocator like `generate_load_number`.** That is the
recorded defect — it increments unconditionally on form open and has burned 52 of
63 load numbers. **Rejected: a global config table like
`invoice_number_config`.** That pattern is right for invoices, where the sequence
IS global and the year is the key; here the scope is the load, so a shared counter
would both gap and mislead.

## 3. How it reaches a settlement

`gatherSettlementRun` (`src/lib/settlementRun.ts`) already carries exactly the
mechanism, and the two recorded defects it was hardened against are the two this
path must avoid. Its comment at lines 174-196 states the rule: `settledSourcesEver`
for things settled once (loads, fuel, one-time deductions), `settledSourcesThisPeriod`
for recurring deductions due every period. Both sets are built from
`settlement_line_items` keyed `source_table:source_id`, scoped by the settlement
read, not unbounded.

**Proposal.** An adjustment is a settle-ONCE item, so:

1. Extend `settlement_line_items_source_table_check` to accept
   `accessorial_adjustments`.
2. The gatherer selects adjustments with `status = 'approved'`,
   `settlement_id IS NULL`, and skips any whose key is in `settledSourcesEver` —
   the same predicate loads already use at `settlementRun.ts:211`.
3. Add `pendingAdjustmentCount` to `UnsettledWork` and to `POPULATION_TRIGGERS`
   in `src/lib/settlementPopulation.ts`, so an approved adjustment ALONE brings a
   driver into the run. Otherwise a departed driver with only a late detention
   never settles it.
4. `computeSettlement` pays it as `lineType: 'adjustment'`, at the percentage the
   pay policy in force assigns to its classification — resolved through the same
   `*_pct` mapping, never a literal.

**What stops a double payment — two independent locks, deliberately.** The
`source_table:source_id` membership test (which is what the fuel defect broke by
being unbounded) AND the `settlement_id` written back on the adjustment row. The
period-scoped set is NOT used here: an adjustment is not recurring, and applying
the recurring rule would re-pay it every period. Conversely, using only
`settledSourcesEver` — the failure that excluded a recurring deduction forever —
is CORRECT for an adjustment, because it genuinely is due once. The two defects
pull in opposite directions; naming which class this belongs to is the whole
decision.

**Period attribution.** The adjustment lands in the settlement for the period in
which it was APPROVED, not the load's delivery period. The record is explicit:
"Late accessorials do NOT reopen a closed period."

## 4. How it reaches an invoice

**Seam only; Pass 5 is not designed here.** Two live facts bound it:
`invoices_load_key UNIQUE (load_id)` — one invoice per load, enforced in the
catalog — and `invoices.status` / the `submitted_at → purchased_at → paid_at →
reconciled_at` lifecycle with its ordering CHECK.

Proposal: the adjustment carries a nullable `invoice_id` and a
`billing_state` (`not_required | pending_supplemental | billed`). The rule at
creation time is a read of the original invoice:

- no invoice yet, or the invoice exists with `submitted_at IS NULL` → the
  adjustment is folded into the original invoice when it is built, and no
  supplemental exists;
- `submitted_at IS NOT NULL` → `pending_supplemental`, and Pass 5 picks it up.

Pass 5 must decide the container, because `UNIQUE (load_id)` forbids a second
`invoices` row for the same load — either a `supplemental_invoices` table or
relaxing that constraint. **This proposal does not choose**, and deliberately
does not create a table with no producer, which is the reason Pass 1 gave for
omitting `supplemental_invoices` in the first place.

## 5. Who approves it and when

States: `draft → pending_approval → approved → settled`, plus `rejected` and
`void` as terminal. Detention negotiated after delivery is the normal case, so
`draft` exists for the dispatcher who is still chasing the broker.

- Dispatcher, management, owner may create and move `draft → pending_approval` —
  the same three roles `assert_charge_entry_allowed` already admits.
- **Only management or owner may move `pending_approval → approved` or
  `rejected`**, matching the Module 7 writer gate. Approval is the moment money
  becomes real; a dispatcher approving his own late accessorial is the control
  this table exists to provide.
- Only the settlement writer moves `approved → settled`, server-side.
- `approved` is IMMUTABLE for amount, classification and load. A wrong approved
  adjustment is voided (with a reason) and re-entered — never edited. Same
  reasoning as immutable settlement statements.
- Every transition writes actor from `current_profile_id()` and a required reason,
  and an audit row, following `add_load_charge`.

**Rejected: auto-approve on creation.** It would make the dispatcher's chase
indistinguishable from an agreed amount and put unagreed money in a driver's check.

## 6. What must not diverge

An adjustment is money on a load, and four readers read money on loads.

| reader | does an approved adjustment affect it? |
|---|---|
| broker invoice (`invoiceBuilder.ts`) | YES — at full amount, no predicate |
| driver settlement (`settlementEngine.ts`) | YES — at the policy percentage for its classification |
| dispatch base (`dispatchSettlement.ts`) | YES, subject to §4.3 — excluded when the resolved pct is 100 or the class is `reimbursement` |
| `loads.total_load_value` | Proposal: NO. It is the broker-facing gross of the ORIGINAL load and the money is fixed; recomputing it would silently restate a load already invoiced |

**Adjustments belong in the shared parts assembler — as a FOURTH part, not as
charges.** `src/lib/loadRateParts.ts` returns `headerComponent`, `fscComponent`,
`chargeParts`, `chargesTotal`. Proposal: add `adjustmentParts` /
`adjustmentsTotal`, populated only from APPROVED adjustments, supplied by the
caller exactly as charges are. Both callers then keep their existing division of
labour: the invoice builder adds everything, the dispatch base applies §4.3 to
adjustment parts on the same predicate as charge parts, unchanged.

**Rejected: merging adjustments into `chargeParts`.** They would become
indistinguishable, and the reconciliation guard could no longer tell an original
charge from a late one — which is precisely the distinction the supplemental
invoice needs.

The reconciliation guard in `src/test/invoice-dispatch-reconciliation.test.ts`
extends by one term and keeps its shape:

```text
invoice_amount − Σ(excluded charges) − Σ(excluded adjustments)
    = dispatch header + dispatch FSC + included charges + included adjustments
```

## 7. Build order and verification

- **Pass 1 — the record.** Table, constraints, RLS, grants, the
  `source_table` CHECK extension, per-load sequence, and structural guards. No
  writer, and a test asserting no second writer exists.
- **Pass 2 — the writer and the approval machine.** One SECURITY DEFINER RPC set
  (`create/submit/approve/reject/void`), `search_path` pinned, role gate in the
  body, actor from `current_profile_id()`, `company_id` trigger-stamped, `anon`
  and `PUBLIC` revoked, definer-catalog entries with reasons.
- **Pass 3 — the settlement seam.** `settlementPopulation` trigger,
  `gatherSettlementRun` selection, `computeSettlement` line, the double-pay guard
  test in BOTH directions (not paid twice; still paid when the driver has nothing
  else).
- **Pass 4 — the parts assembler and the reconciliation guard.**
- **Pass 5 — the invoice seam.** Module 7's, not this record's.

**Verifiable against real data.** The refusal itself: `ST-TEST-005` is live at
`invoiced` (catalog), so `assert_charge_entry_allowed` can be shown refusing a
charge on it and an adjustment can be shown accepted on the same load. The
per-load sequence can be verified live by allocating `-A1` then `-A2` on that
load and confirming no third number was consumed by a rejected attempt. The
parts-assembler and reconciliation changes can be verified against the six seed
loads, which have four `load_charges` rows between them.

**Cannot be verified against real data, plainly.** No settlement has ever
consumed an adjustment, so Pass 3 is FIXTURE EVIDENCE against a synthetic
adjustment — the same weaker standing as the remittance pass. The supplemental
invoice path cannot be verified at all: there is exactly ONE live invoice,
`ST26-0001`, and it is `direct`. A live end-to-end `-A1 → supplemental` run is
impossible until a real load is invoiced, settled, and a real late accessorial is
agreed on it.

## CONTRADICTIONS

**None found.** Three things worth flagging as tensions the build must resolve,
none of which is a contradiction in the record:

1. `settlement_line_items_source_table_check` has no slot for an adjustment —
   expected, since the table does not exist, but it means Pass 3 cannot be
   additive-only.
2. `invoices_load_key UNIQUE (load_id)` forbids a second invoice row per load;
   the supplemental container is genuinely an open Pass 5 decision, exactly as
   Pass 1 recorded.
3. The wish-list entry files the `-A1` path under Module 7 while the build-status
   record calls the adjustment "the Module 5 adjustment". Same work, two module
   labels; the record's dependency ordering (Module 5 before Module 4, Module 7
   after) is unaffected either way.
