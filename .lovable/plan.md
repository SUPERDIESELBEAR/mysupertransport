# Rolling River, round three — a diagnostics message that can be believed, and a parse that repeats itself

## What I confirmed before writing this

- **The diagnostics rows are being rejected by the database, and the cause is now named.** `parser_diagnostics` has RLS policies for dispatch staff but **no table GRANTs at all** — `information_schema.role_table_grants` returns zero rows for it. Without a grant, `authenticated` gets a permission error on insert regardless of the policy. That is the red toast that flashed: `logParserDiagnostics` catches the error, toasts it, and returns `0`.
- **The panel then reads that `0` as good news.** `RateConfirmationParser` renders "No parser diagnostics recorded — nothing on this document went unrecognised" whenever the count is zero, with no knowledge of how many misses the resolver produced. It cannot distinguish "clean document" from "write refused".
- **Region resolution itself is deterministic given the same text layer** — `resolveFieldRegion` reads only the layer. But it only runs for a field the model actually returned a value for, and the model call in `parse-rate-confirmation` sets no `temperature` and no seed. So run-to-run variation in the model's output is the only moving part on the same file, and that is what the plan measures rather than assumes.
- **Appointment dates are model-side too.** The prompt says to return `null` when no time is printed; Rolling River prints dates without clock times, which is exactly the case where an unpinned model will answer differently on two runs.

## What gets built

### 1. The message tells the truth, with both numbers

`logParserDiagnostics` stops returning a bare number and returns `{ collected, written, error }`. The panel states:

- collected 0: "Nothing on this document went unrecognised."
- collected N, written N: "N parser diagnostics recorded."
- collected N, written 0 (or fewer): a warning line in the panel — "N unrecognised items from this parse were **not** recorded: <error message>" — that stays on screen with the parse, not a toast that can be missed.

The failure toast also stops auto-dismissing: it becomes persistent with an explicit dismiss, so a logging failure can never scroll past unread again.

### 2. Grant the table, and audit every recently created table for the same gap

Migration granting `SELECT, INSERT, UPDATE` on `public.parser_diagnostics` to `authenticated` and `ALL` to `service_role`, matching the three existing policies. Then Rolling River is re-parsed and I report the two counts from the panel and read the resulting rows back — kind, failure code, stop number, captured headings.

Widened audit: every table created in this session — `loads`, `load_stops`, `load_charges`, `load_documents`, `load_references`, `load_reference_citations`, `load_status_history`, `load_change_history`, `brokers`, `broker_documents`, `broker_factoring_history`, `company_documents`, `document_send_log`, `pay_policies`, `pay_policy_assignments`, `facilities`, `parser_diagnostics`, and any other new one — is queried against `information_schema.role_table_grants` and its policies, and reported as a table with a verdict per row, the way the actor-stamp audit was reported. Every gap found is closed in the same migration.

The parity test stops being per-table: it walks every `CREATE POLICY` in scope and asserts a matching grant exists for each role the policy names, so a table that can only fail is not creatable. The current test already does this for tables created after a cutoff — the gap is that it reads migrations only; it will also be run against the live schema (policies and grants read from the catalog) so a table granted nowhere is caught even when the migration text looks right.

### 3. Determinism: pin the model, then report the outcome plainly

- The gateway call gets `temperature: 0` and a fixed `seed`, so three parses of the same bytes are asked to produce the same answer.
- I will state whether the gateway **honours** the seed rather than assuming it: the request and response are inspected for seed echo / `system_fingerprint`, and if it is accepted-and-ignored I say so, because then temperature alone reduces variation without eliminating it.
- The prompt is corrected for date-only appointments: a printed date with no clock time fills `appointment_start` at midnight with `low` confidence instead of dropping to `null`, and I confirm on screen that a low-confidence appointment lands in the "Verify these against the document" list.
- A **parse run fingerprint** is added to the panel, collapsed by default: text-layer hash, line count, page count, and per-field region outcome (`resolved` with anchor id, or the failure code).

Rolling River is then parsed **three times** on the fixed build and the three fingerprints are reported side by side, with a plain verdict: whether special instructions resolves on all three and whether both appointment dates come back on all three. If they still vary with temperature pinned, that is named as a model-side finding — no anchor is adjusted to compensate, because an anchor change that hides non-determinism makes the next divergence harder to see.


### 4. Broker card: the name is the headline

In "Broker on the document", the parsed broker name becomes the prominent line — larger, semibold, in body colour — with the MC number secondary beneath or beside it. "No broker in the directory matches this document" drops to a quieter status line below the name and the candidate rows. The section label stays but stops outweighing the fact it labels.

### 5. Findings recorded

`docs/tms-build-status.md` gains:

- Rolling River round three: `parser_diagnostics` shipped with policies and no grants; the panel read the resulting zero as success.
- Standing rule: **a count of zero is not evidence of success** — a message that reports an outcome must distinguish "nothing to do" from "the write was refused", and know how many items were attempted.

## Technical notes

Files touched: `src/lib/parserDiagnostics.ts` (result object, persistent toast); `src/components/dispatch/loadForm/RateConfirmationParser.tsx` (message logic, run fingerprint, broker card weight); `src/lib/verbatimCheck.ts` (surface per-field region outcome for the fingerprint); `supabase/functions/parse-rate-confirmation/index.ts` (temperature/seed, date-only appointment rule); one migration for the grants; tests for the message logic and grant parity; `docs/tms-build-status.md`.
