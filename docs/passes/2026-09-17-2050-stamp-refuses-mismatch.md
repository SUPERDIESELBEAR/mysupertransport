# 2026-09-17 2050 UTC — the "twelve" correction, and the stamp premise that does not hold

Documentation only. **No migration was written.** No function, application code or data
change. Carrier count: 1. The prompt's final line arrived intact; the prompt was not
truncated.

## Step 1 — THE CORRECTION, and it is exactly as the prompt says

The 1940 pass wrote, in the record entry "the twelve unstamped tables, and the reachability
guard turned back on", in its own report, and in the OWNER FOLLOW-UP LIST, that the
2026-09-16 disposition's twelve were the MONEY tables and that this pass's twelve were a
different set. **FALSE.** `docs/tms-build-status.md` lines 14529–14533, verbatim:

```
**PER-CARRIER, next batch (12):** `fuel_transactions`, `fuel_transaction_lines`,
`fuel_import_batches`, `fuel_disagreement_acceptances`, `operator_broadcasts`,
`operator_departing_events`, `operator_parking_events`, `equipment_return_confirmations`,
`driver_optional_docs`, `onboard_assignment_sheet_sends`, `staff_event_acknowledgments`,
`staff_help_query_log`.
```

Element for element the twelve the 1940 pass stamped. **The work was correct and only the
description was wrong** — the migration did precisely what the owner's disposition decided.

The 1940 entry was NOT rewritten. A correction was appended to `docs/tms-build-status.md`
as a new dated entry, section (a): what was claimed, the disposition quoted, and the
statement that the work was right.

Wish-list line 45 no longer attributes the money tables to the 2026-09-16 decision. It now
describes them as what they are: twelve tables that already carry `company_id` and already
test it on reads (`(company_id = current_company_id()) AND <role test>`), still pending the
restrictive `tenant_isolation` policy.

### How the misreading happened

The 2026-09-16 entry contains TWO groups of twelve. Section (a) is the disposition — the
twelve to migrate. Section (c) is the read-enforcement census, and it ends with its own
sentence beginning **"The twelve:"**, naming `accessorial_adjustments`,
`ar_aging_snapshots`, `carrier_signature_settings`, `factoring_remittances`,
`invoice_batches`, `invoice_line_items`, `invoice_number_config`, `invoices`, `payments`,
`settlement_settings`, `share_tokens`, `unit_number_config` — the money tables, listed
because they were the twelve that ALREADY enforced `company_id` on reads. Same entry, same
opening words, unrelated purpose. The 1940 pass matched the phrase instead of the section,
found a set that did not match its prompt, and wrote its own error down as a contradiction
in the record. Procedural lesson: a claimed contradiction must quote the line AND its
section heading before it is recorded.

## Step 2 — THE STAMP: the premise does not hold, and no migration was written

### What was asked, and what is live

The prompt states the four functions "fill a NULL `company_id` but let a supplied value
stand, so the 1940 pass's spoofed insert survived". **Live, none of the four does that.**
Each derives the company and then assigns it **unconditionally**, on
`BEFORE INSERT OR UPDATE`. Bodies read from `pg_get_functiondef`:

```sql
-- stamp_company_from_fuel_batch()
SELECT b.company_id INTO v_company FROM public.fuel_import_batches b WHERE b.id = NEW.batch_id;
IF v_company IS NULL THEN RAISE EXCEPTION 'No company for fuel import batch %: refusing to write %',
  NEW.batch_id, TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
NEW.company_id := v_company;          -- unconditional
```

`stamp_company_from_fuel_transaction()` and `stamp_company_from_osas_sheet()` are the same
shape over `transaction_id` and `sheet_id`. `stamp_company_from_user_ref()` resolves the
user column via `company_members ∪ operators ∪ truck_owners`, falls back to
`current_company_id()`, raises `42501` if neither resolves, and ends with the same
unconditional `NEW.company_id := v_company;`.

A supplied value therefore CANNOT stand. Demonstrated live, each in a transaction that was
rolled back, under Marcus's claims
(`request.jwt.claims.sub = 5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe`), inserting an explicit
`company_id = 000000000000000000000000000000ff`:

```
staff_event_acknowledgments   RETURNING company_id -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
driver_optional_docs          RETURNING company_id -> 6b54d0e6-8743-4284-b55b-8cd094b093dd
```

Both spoofs were overwritten with the real carrier. So the 1940 report's Step 5 finding —
"spoofed `company_id` → 201, and the spoofed value SURVIVED" — is **also wrong**, and this
report corrects it. The likeliest cause is that its probe read back its own request payload
rather than the row PostgREST returned; no code path in the trigger can leave a spoofed
value stored.

### The named model function does not exist

Every trigger function in `public` was searched for a company comparison that raises. The
only three are `enforce_invoice_immutability`, `enforce_remittance_immutability` and
`enforce_accessorial_adjustment_immutability`, and each compares
`NEW.company_id IS DISTINCT FROM OLD.company_id` on an already-submitted row (quoted in the
record entry). That is new-versus-old immutability, not derived-versus-supplied. **No stamp
raises on a mismatch**, so there was no shape to copy.

### Writers that legitimately supply a company

Every writer of the twelve was read. **Not one supplies `company_id`**:
`useDriverOptionalDocs.ts`, `useStaffBirthdayAnniversaryEvents.ts`, `staff-help-chat`,
`send-operator-broadcast`, both `onboard_assignment_sheet_sends` inserts in
`send-osas-to-operator` (lines 102 and 295), and `commit_fuel_import`.

`send-osas-to-operator` DOES pass an explicit `company_id` on OTHER tables —
`onboard_assignment_sheets`, `onboard_assignment_sheet_items`, `equipment_assignments` —
derived from the OPERATOR (line 199: `select('company_id') … eq('id', payload.operatorId)`),
while the sends trigger derives from the SHEET. With one carrier those agree; with two they
could disagree, and a raise on that path would fail a send that succeeds today.

### The decision, recorded as a judgement call

No migration was written. The hole the change was meant to close is already closed by the
unconditional assignment; converting silent correction into a raise would add a failure
mode without adding protection, and the only place a mismatch could arise is the
operator-versus-sheet derivation above. If the owner wants the loud shape regardless, it is
one migration, and the record entry names where it starts. Nothing was created or replaced,
so no new EXECUTE grants exist to revoke; migration 0006's revokes remain in force on the
four functions.

## Cleanup and residue

Both probes ran inside `BEGIN … ROLLBACK`. Live counts after:

```
sea_residue 0 | dod_residue 0 | staff_event_acknowledgments 115 | driver_optional_docs 0
```

Zero residue.

## Step 3 — RECORD

`docs/tms-build-status.md`: new dated entry "2026-09-17 2050 UTC — two corrections",
sections (a) the twelve misread, (b) the stamp premise, (c) suite. `docs/tms-wish-list.md`:
line 45 rewritten as above. **The stamp-weakness follow-up line was NOT removed** — Step 2
did not close it by migration; it showed the weakness was never there. There was no
separate wish-list line for it (it lived only in the 1940 record entry and report, both now
corrected).

## Step 4 — FULL SUITE AND TYPECHECK

Verbatim:

```text
 Test Files  202 passed | 2 skipped (204)
      Tests  2019 passed | 16 skipped (2035)
     Errors  3 errors
   Start at  20:51:34
   Duration  421.30s
```

The three errors are the known reporter timeouts, quoted:

```text
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 ❯ Object.onTimeoutError node_modules/.deno/vitest@3.2.7/node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10
```

Not assertions, and no test failed, so no isolated re-run was required. No contention
failure appeared in this run.

Typecheck: `npx tsgo -p tsconfig.app.json --noEmit` — clean, exit 0, no output.

## Files changed (`git diff --stat` for the pass)

```text
 docs/tms-build-status.md | 88 ++++++++++++++++++++++++++++++++++++++++++++++++
 docs/tms-wish-list.md    |  2 +-
 2 files changed, 89 insertions(+), 1 deletion(-)
```

Plus this report, written last.
