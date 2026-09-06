# Module 6 (Fuel) — read as one description, verified against source and live catalog

Read-only. Nothing changed. Every claim below says whether it came from the current
source or from a live catalog/data query.

---

## 1. Does the record describe what is actually there?

**Verified TRUE (live catalog):**

- Ten `fuel_line_type` values added; `fuel_line_type` now has 22 labels ending
  `diesel1, unleaded, cng, lng, lpg, reefer_cng, reefer_lng, reefer_lpg, oil, tax`.
- `fuel_import_batches` carries `recognized_columns`, `unrecognized_columns`,
  `missing_optional_columns`.
- Exactly one `commit_fuel_import`, signature `(text,text,jsonb,jsonb)`. The
  three-argument form is gone.
- `fuel_resolve_card(text,date)` holds EXECUTE for neither `authenticated` nor `anon`;
  `preview_fuel_import`, `commit_fuel_import`, `assign_fuel_transaction_operator` are
  `authenticated`-only, `anon` false.
- `fuel_provider` has one label, `multiservice`.
- `fuel_transactions`, `fuel_transaction_lines`, `fuel_import_batches`, `cash_advances`,
  `deductions` all hold ZERO rows. The Pass 1 amendment and proposal item 2 are current.

**Verified TRUE (current source):**

- `MULTISERVICE_HEADER_2026_09_05` in `src/lib/fuel/multiserviceCsv.ts` is 27 columns.
- `REQUIRED_COLUMNS` = `Card No, Invoice No, Invoice Date, Total Amount`.
- `Oil Amt` / `Oil Qty` and `Reefer Gallons` present; `Reefer Gallons` rides as a
  quantity on the `reefer` spec with no new flat column.
- `Merchant Name` is in the header constant and absent from `KNOWN_COLUMNS` /
  `TEXT_COLUMNS` — unrecognised, as recorded.
- The four bucket labels are exactly `Fuel`, `Cash advance`, `Repairs`,
  `Other fuel-card charges`; both discrepancy labels and
  ` [statement did not add up at import]` match the record verbatim.
- `settlementRun.ts` `FUEL_SELECT` reads `reconciliation_ok, reconciliation_delta`
  and the line rows, and passes them to `fuelBucketLines`.
- `KNOWN_AUTHENTICATED_EXECUTABLE_MAX = 120` (`src/test/definer-live-catalog.test.ts:660`)
  and the fuel entries there name the four-argument form.

**WRONG — one hard count error (current source):**

- Pass 3 states "**Ten** `CategorySpec` entries carry `unverified: true`". There are
  **nine** (`grep -c` = 9), and the nine the section then lists are the nine in the
  file. The prose count contradicts its own list.

**STALE — written before 2026-09-05/06 and never amended in place:**

- The 2026-09-05 proposal, item 1: "the settlement read selects only `total_amount`
  and `fuel_discount_amount` (`settlementRun.ts`)" — no longer true; the select was
  widened in Passes 4 and 5.
- Same item: "no separate line on the statement" for a repair — no longer true;
  Pass 4 gives `minor_repairs`/`tires` their own `Repairs` line. Pass 4 says so; the
  proposal section still reads as current fact. The *money* half of that finding
  (deducted in full, no approval) IS still true.
- Pass 1, "No operator-facing read exists in this pass. Driver-visible fuel arrives
  with settlements" — superseded by Passes 4/5, not marked as superseded.

Everything else Pass 1 asserts (dedupe key, card-first resolution, flag-never-drop,
two money formats, discount added like any other category) is still true in source.

---

## 2. Described twice?

- **Fuel discount** — Pass 1 ("pass-through, default false, company margin") and
  Module 4 "The fuel discount is never netted". They **agree** and are complementary.
- **Empty fuel tables** — Pass 1 amendment and proposal item 2. Agree; cross-referenced.
- **Purge blast radius** — registration note and purge Step 1. Agree.
- **Why name matching replaced positional, the ten enum values, the ceiling** — stated
  in the Pass 2 body AND again in the "Addendum to the Pass 2 record" three sections
  later. Agree word-for-substance; pure duplication, and the addendum sits under the
  proposal section rather than beside Pass 2.
- **The repair defect** — proposal item 1 and Pass 4. They **disagree** on one point:
  the separate line now exists (see above).

No fuel item is filed under two different modules.

---

## 3. Missing

Recorded and correct: the four buckets and their mapping (including fees-with-advances
and tires-with-repairs); both unexplained-balance labels and the import-flag suffix;
the detection method (a discrepancy line *without* the import suffix); the ten enum
values; the corrected `Oil Amt`/`Oil Qty` with the checkbox-label reason;
`Reefer Gallons`; `unrecognizedMoneyNotice` and its verbatim wording.

Recorded but wrong in count: the nine unverified names (recorded as ten).

**MISSING ENTIRELY — the real 2026-09-05 export.** Nothing in either document contains
69 rows, $31,913.66, 3 unmatched on card 224, 2 disagreements on card 205, or the fact
that it was never committed. Grepped both files for the figures and the phrase: no hit.
This is the only evidence that the name-matching work was ever exercised on a real
file, and with the fuel tables at zero rows there is no other trace of it anywhere.

Built but not recorded: nothing else found.

---

## 4. Decisions recorded as decisions?

| Decision | Status |
| --- | --- |
| Four buckets; fees with advances, tires with repairs | **Stated, not decided.** Pass 4 gives the reasoning for fees ("the true cost of the money he drew") but names no rejected alternative for the bucket set itself |
| Split-and-name vs refuse-to-split | **Fully recorded** — choice, both rejected alternatives (refuse; assign to `other`), and why |
| `invoice_date` as period bound | **Fully recorded** — posting date and import batch each rejected with reasons, plus the late-fuel residual |
| Per-driver discount override vs driver-specific pay policy | **ABSENT.** No mention anywhere in either document |
| `Merchant Name` unrecognised | **Stated with a reason** ("nothing in the schema stores it"), but the alternative actually available — adding it to `TEXT_COLUMNS` — is never named |

---

## 5. Open items

| Item | Recorded? | Trigger |
| --- | --- | --- |
| Repair approval path | Yes, proposal item 1 | Yes — "fix before the first MultiService file is imported" |
| Discrepancy visible but not alerted | Yes, Pass 5 closing lines | **No trigger** |
| Driver-specific pay policy gap | **Not recorded at all** | — |
| Late fuel | Yes, proposal item 4 | Yes — "decide before the first settlement runs against imported fuel" |
| Comdata as a sibling module | Yes, proposal item 5 | Precondition only ("a real Comdata file"), no trigger event |
| Module 9 fuel reporting | **Not recorded.** The Module 9 wish-list entries cover RPM, driver revenue basis and dispatcher attribution; none mentions fuel | — |

---

## 6. The owner's pending import-table changes

**None of it is in the record.** Grepped both documents for MM/DD, expandable, sortable,
gallons, Advances-as-a-column, Total-instead-of-Amount: no fuel-related hit.

Current source confirms all seven are unbuilt: `FuelImportPage.tsx` renders an
`Invoice` header and an `Amount` header, a `Total` summary stat, no gallons column,
no sort handlers, no expandable rows, no Fuel/Advances/Other split, and no
filtering on the summary tiles. If this list is not written down it is lost.

---

## Verdict

**ACCURATE WITH NAMED GAPS.**

The schema, function and authorization claims all verify against the live catalog with
no exceptions. The parser and settlement claims verify against source with one wrong
count (ten unverified specs, actually nine) and three stale statements in the
before-the-fact proposal section that later passes overtook without amending in place.
The two real gaps are omissions, not errors: the 2026-09-05 export result — the only
real-file evidence Module 6 has, now with no trace in the database — and the owner's
seven pending import-table changes. Two open items (discrepancy alerting, Comdata)
carry no trigger, and two more (driver-specific pay policy, Module 9 fuel reporting)
are absent from the record entirely.
