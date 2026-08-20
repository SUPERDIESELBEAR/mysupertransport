# Widen special instructions to keep unpriced driver actions

The rate-confirmation parser currently keeps a term only when it carries a dollar amount, a time threshold, or a required action — but the three clauses sit in one sentence surrounded by fine examples, so the model treats a printed penalty as the price of admission. Unpriced handling instructions ("no touch freight", "call dispatch on arrival") get dropped.

## Change

Split the inclusion rule into two independent clauses in the extraction prompt, so the operational clause stands on its own:

1. **Priced or timed terms** (unchanged) — detention rate and free time, layover pay, late-arrival penalties, missed check-call fines, tracking-compliance fines, paperwork deadlines and deductions, advance fees, OS&D reporting windows.
2. **Operational instructions, penalty or not** (new, independent) — freight handling (no-touch, driver-assist, driver-unload); call requirements (dispatch or broker on arrival, at loading, when empty); facility check-in procedure (where to report, which gate or door); appointment required vs first-come-first-served; PPE and equipment (load locks, straps, tarps); seal handling; and what to do when something goes wrong on this load.

State the governing distinction in one line: capture anything that tells the driver or dispatcher what to do on this load, whether or not a penalty is attached; skip anything that only allocates legal responsibility.

The skip list is unchanged — legal boilerplate, insurance and liability, double-brokering, indemnification, governing law, signature blocks. Add a passing example alongside the existing ones so the model sees an unpriced keeper: "No touch freight; call dispatch on arrival" passes, "Carrier is responsible for any damage to product" does not.

## Verification

Redeploy the function and parse AAA's original rate confirmation PDF exactly as uploaded — not a rebuilt test document, so the real file's layout quirks are exercised. Then report the full extracted special instructions text verbatim so both sides can be judged: the unpriced operational items now present, and no boilerplate pulled in behind them. Confirm the reference-number and total behaviour from the previous pass is unaffected on the real file, and run the test suite.

## Technical detail

Single file: the `special_instructions` rule inside `USER_PROMPT` in `supabase/functions/parse-rate-confirmation/index.ts` (around lines 134-138). No schema, client, or UI changes — `special_instructions` is already a plain string field flowing into the review screen.
