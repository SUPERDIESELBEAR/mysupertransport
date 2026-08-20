# Verify the widened special-instructions rule against AAA's real rate confirmation

The prompt change is already deployed: the extraction rule now has two independent clauses — priced/timed terms, and operational instructions whether or not a penalty is attached — with the skip list (legal boilerplate, insurance/liability, double-brokering, indemnification, governing law, signature blocks) unchanged.

What remains is verification against the actual AAA Freight Global PDF, now uploaded, rather than a reconstruction.

## Verification steps

1. Parse the uploaded `AAA_Freight_Global_Inc..pdf` through the deployed `parse-rate-confirmation` function exactly as the file was sent — no rebuilt test document, so the real layout quirks are exercised.
2. Report the full extracted `special_instructions` text verbatim, so both sides can be judged: the unpriced operational items now present (no-touch/driver-assist, call requirements, check-in procedure, appointment vs FCFS, PPE, seal handling, what-to-do-when-wrong), and no legal boilerplate pulled in behind them.
3. Confirm the two prior fixes still hold on the real file:
   - cross-stop duplicate internal codes are dropped, and each stop's reference number is a real gate/invoice reference or blank
   - assigned stop-off charges are included in Total Load Value
4. Run the test suite and report the result.

## Outcome

No code changes are planned. If the real document exposes a gap — an operational item still dropped, or boilerplate now leaking in — I will report exactly what and propose a follow-up prompt adjustment rather than silently editing.
