# Rolling River, round three — prove what is deployed before changing code

No fix is proposed for items 2-4 until a parse has actually been run and read. Below is what I verified by reading code, the deployed function's own log, and the diagnostics table, and what is still unproven.

## What I verified (not predicted)

- **Source is correct.** `supabase/functions/parse-rate-confirmation/index.ts` does attach the `run` envelope (`model`, `temperature`, `seed`, `seed_echoed`, `system_fingerprint`) to the 200 response, and `src/lib/parseFingerprint.ts` reads it from `parsed.run`. The panel in `RateConfirmationParser.tsx` renders confidence brackets, the arrow to the end time, and the "Discarded by the low-confidence gate" block. So the shipped source cannot produce the screen you described.
- **The dev server is serving that new source.** Fetching `/src/lib/parseFingerprint.ts` and `/src/components/dispatch/loadForm/RateConfirmationParser.tsx` off the running server returns the versions with `seedEchoed`, `determinismNote`, and the discarded block. So a stale *server* bundle is ruled out; a stale bundle in your browser (service worker / app-shell cache) is not.
- **The contract warning could not have fired, by construction.** `EXPECTED_PARSER_CONTRACT = 4` and the deployed function logged `build contract=4 built_at=2026-08-24T00:00:00Z`. The `run` envelope was added *without* bumping `contract` or `built_at`, so a deploy frozen before that change still answers "4" and the divergence check passes. The warning is real but blind to the exact change you are asking about — that is a control gap, and it is the first thing this plan fixes.
- **Diagnostics landed.** Four rows at 14:32:37 for `Rolling River Logistics.pdf`: `stop_notes_verbatim / stop_not_found (stop 1)`, `special_instructions_verbatim / anchor_not_found`, `broker_terms_verbatim / anchor_not_found`, and one `reference_row_dropped (Pickup #)`. The captured headings include a bare `Comments` line, so the anchor set is not matching a heading that is present in the text layer.
- **The loadout banner is driven entirely by model output.** `assessLoadout` scores only `parsed.loadout_signals` — trailer-relocation language, no BOL, photo POD, multi-day use, no commodity, trailer number — and shows the banner at score >= 4. Nothing in it reads the document text. So the banner is exactly as stable as the model's answer, which is the same non-determinism as item 5. It also indexes `p.loadout_signals` unguarded, so a response missing that object throws rather than degrading.

## Step 1 — Establish what is live, then run a real parse

1. Bump `PARSER_BUILD` to contract 5 with a fresh `built_at`, and raise `EXPECTED_PARSER_CONTRACT` to 5, so "shape changed" and "deploy is current" stop being separate honour-system claims. Add `run` presence to the client check: a response without a `run` envelope is a contract failure with its own message, not a silent "unknown".
2. Deploy `parse-rate-confirmation` explicitly (not relying on auto-deploy), then call it directly with the Rolling River PDF and read the raw JSON: whether `run` is present, the literal `seed_echoed`, `system_fingerprint`, and the literal `loadout_signals` object.
3. Run the parse through the UI in a real browser session, screenshot the fingerprint panel and the banner area, and report what the screen shows — measured, not predicted.

**I need the file to do this**: attach `Rolling River Logistics.pdf` (the same copy you parsed). Without it I can only re-read code, which is what has already been wrong three times.

## Step 2 — Name the cause per item, then fix

Items 2, 3, 4 get one diagnosis from step 1's raw JSON plus the browser run, and the fix follows the finding:

- `run` absent from the response -> stale deploy; the contract bump above turns that into a loud message instead of "model unknown".
- `run` present but the panel still prints the old lines -> stale client bundle in your browser; the fix is a build-stamp check on the parse panel (it prints the app build id next to the layer hash) plus cache handling, so a stale screen announces itself.
- Missing appointment end -> read from the same JSON: either the model returned no `appointment_end`, or the gate discarded it (in which case it must appear in the discarded list — a value shown without its outcome is already a standing-rule violation).

## Step 3 — The loadout banner, cause named

The banner did not break; it was never stable. It is a pure function of `loadout_signals`, so when the model returns a weaker signal set for the same document the score falls under 4 and the block does not render at all — silently, with no trace that a loadout assessment even ran. Because the derived trailer-use window lives inside the load-type change, one flickering model answer takes an unrelated feature offline. Fixes:

1. **Score from the document, not only the model.** Add text-layer evidence to `assessLoadout` (relocation wording, absence of BOL/commodity, a printed trailer number, a stated day count) alongside the model signals, so the assessment is reproducible from the same text layer regardless of what the model says on a given run.
2. **Never render nothing.** Below the threshold the panel shows a quiet line — "Loadout assessment: score N of 10, not suspected" with the reasons and a "Switch to Loadout anyway" button — so the load-type change and the derived use window are always reachable from the parse screen.
3. **Log the assessment.** Write one `loadout_assessment` diagnostics row per parse (score, which signals fired, whether it crossed the threshold), so a run-to-run flip is measurable instead of anecdotal.
4. **Guard the access.** A response missing `loadout_signals` degrades to score 0 with a stated reason instead of throwing.

## Step 4 — Non-determinism, item 5

`special_instructions_verbatim` resolving on one run and not another stays unmeasurable while run metadata reads unknown, so it is deliberately last. Once step 1 proves the `run` envelope reaches the client, I re-parse the same document twice and compare layer hash against field verdicts: same hash with different verdicts is the model, different hash is extraction. Separately, the `Comments` heading is present in the captured headings while the anchor missed it — that is an anchor-vocabulary finding for the three-document design, recorded in `docs/tms-build-status.md`, not patched ad hoc here.

## Technical notes

Files: `supabase/functions/parse-rate-confirmation/index.ts` (build stamp), `src/lib/rateConfirmation.ts` (`EXPECTED_PARSER_CONTRACT`, `run`-presence check, `assessLoadout` text evidence), `RateConfirmationParser.tsx` (build stamp line, always-rendered loadout assessment), `src/lib/parserDiagnostics.ts` (`loadout_assessment` kind), tests for the sub-threshold render path and the document-side scoring. No schema change beyond allowing the new diagnostics kind.

## Standing rule this adds

A build identity that a human types by hand cannot prove a deploy. The contract number is bumped in the same change as any response-shape change, and the client rejects a response whose envelope it was written to read but did not receive.
