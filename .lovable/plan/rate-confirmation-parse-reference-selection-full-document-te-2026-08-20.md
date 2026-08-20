# Rate Confirmation Parse — Reference Selection, Full-Document Terms, Stop-Off Totals

## Problem 2 — diagnosis first (this determines the fix)

**Root cause: prompt framing, not page transmission.**

Evidence:

- The edge function base64-encodes the uploaded file whole and sends it as a single `file` document part. There is no page splitting, page limit, or truncation anywhere in the upload or function code — the guard is a byte-size check (20 MB) the AAA document is nowhere near.
- The gateway log for the 16:50 parse shows a successful 200 with 3,177 input tokens. The prompt alone accounts for roughly 1,400 of those; the remainder is consistent with a multi-page document being tokenized, not a single page.
- The output was 2,016 tokens — well short of any completion limit, so nothing was cut off on the way back.

What actually happened is a framing problem. `special_instructions` is described in the schema only as "carrier requirements that apply to the whole load," with no instruction to sweep the entire document. The document has a block literally headed **Instructions** on page one, so the model treated that heading as the answer and never mined the page-three Agreement prose for accessorial rates and penalties.

Fix is therefore prompt-side, not transport-side.

## Fix 1 — Reference number selection

Three layered changes:

1. **Cross-stop duplicate rule (server).** After the per-stop reference filter runs, any value appearing identically on two or more stops is dropped as an internal broker code — a real pickup number and delivery number never match. Each drop is logged with the label, value and rule, same as the existing discard logging.
2. **Drop references that duplicate a load-level id.** A stop reference whose value equals the extracted BOL, PO or broker load number is not a gate reference; it is the same number restated. Dropped and logged.
3. **No least-bad pick (client).** `pickReference` currently returns the highest-confidence remaining candidate whatever it is. It changes to prefer references whose label explicitly reads pickup / PU / delivery / DL / appointment / confirmation / release / seal, and to return nothing when no such labelled candidate survives at high or medium confidence. An unlabelled two-letter code is never promoted into the field. Blank beats wrong at a guard shack.

Prompt guidance is strengthened to match: prefer explicitly labelled pickup / delivery / appointment / release references; treat bare two-letter codes with suspicion and mark them `useful: false` unless context clearly shows a gate use; never fabricate a stop reference; note when the same value appears on more than one stop.

On the AAA document, the outcome is both stops blank — which is the correct answer, since the only real reference is the load number already captured as the BOL.

## Fix 2 — Whole-document terms sweep

`special_instructions` is redefined in the prompt as a full-document sweep rather than a section transcription. Explicitly:

- Scan **every page**, regardless of section heading — Agreement, Terms and Conditions, Carrier Requirements, fine print, footers.
- The block headed "Instructions" is one source among several, never the whole answer.

**Inclusion test — the filter runs in both directions.** A term is captured only if it carries a specific dollar amount, a specific time threshold, or a required action a driver or dispatcher must take on this load. Everything else is skipped.

Capture: detention rate and free-time threshold, layover pay by equipment type, late-arrival penalties, missed check-call fines, tracking-compliance fines, paperwork deadlines and late-paperwork deductions, check/advance processing fees, OS&D reporting windows and fines, required tracking apps, facility check-in procedures, fuel advance terms.

Skip: general legal boilerplate, double-brokering prohibitions, insurance and coverage requirements, liability allocation, indemnification, governing law and venue, signature blocks, and anything restating standard broker-carrier agreement language with no load-specific consequence.

The prompt states the test in the dispatcher's terms, with both examples: "Detention $40/hr after 3 hours" is captured; "Carrier is responsible for any damage to product" is not. A wall of legal prose is as useless as an empty field.

Output as a readable one-line-per-term list, quoting printed amounts verbatim and omitting anything not printed.

To leave room for the longer output, the request gains an explicit generous completion limit so a dense terms list is never clipped.

Verification: re-parse the AAA Freight Global document and **report the full extracted special instructions text back in chat**, so both the catch rate and any boilerplate that slipped through can be judged directly.


## Fix 3 — Stop-off charges in Total Load Value

Confirmed defect. `calcTotalLoadValue` sums linehaul (or per-mile / per-ton) plus unbundled FSC only — stop-off charges are not an input, so assigning the $50 Extra Stop line writes `stopoff_charge_amount` on the chosen stop correctly but the header total stays at $1,000.

Change: the rate math accepts the stops' stop-off charges and adds their sum to the total for non-loadout loads, and the Create Load header recomputes when any stop's charge changes. Assigning the Extra Stop line then moves the total to $1,050 immediately, and manually typing a stop-off charge on a stop card does the same. Loadout loads keep using the relocation fee alone. Unit coverage is added for the summed case.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts`: prompt changes for reference labelling and the full-document terms sweep; post-filter cross-stop duplicate and load-id duplicate removal with logging; explicit max completion tokens. Redeploy.
- `src/lib/rateConfirmation.ts`: `pickReference` becomes label-preferring and returns null rather than a fallback candidate.
- `src/lib/loadRateMath.ts`: `RateInput` gains stop-off charges; `calcTotalLoadValue` includes them for non-loadout loads.
- `src/pages/dispatch/CreateLoadPage.tsx`: pass stop charges into the total calculation.
- No schema changes, no changes to save logic, broker matching or loadout detection.
