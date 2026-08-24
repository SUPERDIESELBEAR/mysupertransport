# Parser diagnostics: real cause found, plus determinism and card work

Investigation before planning changed the diagnosis. Two corrections to what was said last turn:

**1. `parser_diagnostics` grants are fine.** The live catalog shows `authenticated` holding SELECT, INSERT, UPDATE, DELETE and `service_role` holding all four. The earlier "no grants" reading came from querying `information_schema.role_table_grants`, which only shows grants the querying role is party to — it is empty here for almost every table and is not a usable audit source. `has_table_privilege` against the live catalog is.

**2. The real cause of zero rows: mixed row shapes in one bulk insert.** The two rows that did land are both from the Blue Grace parse and are both `kind = anchor_miss` — a uniform batch. The Rolling River parse produced anchor misses *and* dropped-reference rows (the "Assign at pickup" placeholder drop added last turn). Those two row types carry different keys (`headings`/`occurrences` versus `label`/`reference_class`), and PostgREST rejects a bulk insert whose objects do not all share a key set (PGRST102, "All object keys must match"). The batch failed whole, 0 rows written, and the red toast that flashed by was that rejection.

Grant audit across the live catalog: one table, `share_token_access_log`, has a SELECT-only policy and no INSERT grant for `authenticated`. That is correct as designed (writes are service-role) and is left alone.

## Sections

### 1. Diagnostics write that cannot lie

- Every payload row is normalised to the same full key set before insert (missing fields explicit `null`, `headings` `[]`, `occurrences` `0`), so a mixed parse inserts.
- `logParserDiagnostics` returns `{ collected, written, error }` instead of a bare count.
- The failure toast becomes persistent and states how many items were lost.

### 2. Panel message that matches the fields on screen

- Zero written with unresolved fields present now reads as a logging failure, naming both numbers: "3 unrecognised items collected, 0 recorded".
- Zero collected and zero unresolved fields is the only case that reads as a clean document.

### 3. Determinism

- Pin the gateway call: `temperature: 0` and a fixed `seed`. Record the returned `system_fingerprint` (or its absence) so whether the gateway honours the seed is observable rather than assumed.
- Appointment dates: a date printed with no clock time currently returns `null` and is dropped. It will instead return midnight at `medium` confidence — `medium`, not `low`, because low-confidence values are discarded by the form writer, while medium fills the field and adds it to the "verify these" list.
- A collapsed "parse run fingerprint" on the panel: text-layer hash, line and page counts, model, `system_fingerprint`, and each verbatim field's verdict. Two runs of one document become directly comparable.

### 4. Broker card

Parsed broker name becomes the headline of the card — large and bold, above the status line. MC number stays secondary. "No broker in the directory matches this document" drops to a status line under it.

### 5. Grant parity against the live catalog

- A `public.grant_parity_report()` SQL function that reads `pg_policy` and `has_table_privilege` at call time and returns any public table whose policies and grants disagree. A migration text can read correctly and still have been granted nowhere; only the catalog settles it.
- A test asserting the checked-in parity snapshot is empty, and a test asserting every diagnostics payload row exposes an identical key set — the specific failure that shipped here.

## Verification

Re-parse Rolling River three times on the fixed build; report the three fingerprints side by side, the two diagnostics counts, the rows that landed with failure codes and headings, whether the seed is honoured, and the full suite result.
