# Loadout scoring truthfulness, determinism note, and a measured variance run

## Answers from the current code (read, not predicted)

**1. Contradicted signals still score today.** In `assessLoadout`, a signal fires when
`model || document === true`. The document's answer can only *add* a firing, never remove
one. So `no_commodity` — model true, printed page shows a Commodity value — is reported in
`disagreements` **and still contributes its 1 point**. Rolling River's 4 is
`trailer_relocation_language` 3 (both sources) + `no_commodity` 1 (model only, document
contradicts). Excluding the contradicted signal, this document scores **3 of 10** — below the
threshold of 4. That is exactly the concern: one point of the qualifying score rests on a
false premise.

**2. `appointment_end` is optional by contract.** The prompt says null unless a closing time
is printed; the form schema has it optional; the DB column is nullable. Consumers: the stops
timeline (displays start-only when end is null) and the loadout use-window derivation, which
reads start and end and falls back to whichever dates exist. Nothing computes a duration from
it — detention timing does not read it today. So a run that returns start only is acceptable
and loses nothing.

**3. `seed_echoed: false`** means run-to-run variation cannot be eliminated on this gateway,
so `special_instructions_verbatim` going null on some runs is variance to make visible, not a
bug to chase.

## What to change

### Contradicted signals do not score

- A signal whose document answer is `false` while the model says true is marked
  `contradicted` and scores **0**, while still being listed with its reason and the
  disagreement so nothing is hidden.
- Only applies when the text layer was actually read (`documentRead`); an unreadable layer
  (`document === null`) never suppresses a model signal.
- The panel shows the score as earned plus, when any signal was suppressed, what it would
  have been — so a dispatcher can see why a document sits just under the line.
- The `loadout_assessment` diagnostic row records per-signal `contradicted` state alongside
  source and points.
- Tests in `src/lib/__tests__/loadoutAssessment.test.ts`: a contradicted signal scores zero;
  Rolling River's signal set scores 3 and renders "not suspected" with the switch still
  reachable; a null document answer still scores the model signal.

### Documentation (`docs/tms-build-status.md`)

Add, under the existing determinism section:

- Determinism is **unverified** on this provider: the seed is sent and not echoed. Pinning
  temperature reduces variance; it does not remove it.
- The correct response to a field that varies between runs is to make the variance visible
  (fingerprint + diagnostics), **never** to loosen or retune anchors to compensate.
- `appointment_end` is optional by contract; a start-only stop is a valid parse. If anything
  ever needs to compute from an end, it derives it explicitly rather than assuming the parse
  supplies one.
- Standing rule: a scored signal the document actively contradicts does not count toward the
  threshold.
- Standing operational note: **auto-deploy has missed `parse-rate-confirmation` twice.** An
  explicit deploy is required for this function, confirmed by a live request that reads
  `parser_build` and `run` back.

### Measure the actual variance

After deploying, parse the Rolling River rate confirmation **twice more** and report the two
fingerprints side by side:

- text-layer hash (expect identical — same file)
- loadout score, per-signal source and contradicted state
- per-field verdicts: value present/null, confidence, discarded-by-gate
- `run` block: model, temperature, seed, `seed_echoed`
- appointment start/end per stop

Report the measured magnitude of run-to-run difference rather than asserting it, and state
which fields moved. No anchor or prompt tuning in response to what the two runs show — the
purpose is measurement.

## Technical notes

- Files touched: `src/lib/rateConfirmation.ts` (signal typing + scoring),
  `src/components/dispatch/loadForm/RateConfirmationParser.tsx` (render suppressed points),
  `src/lib/parserDiagnostics.ts` (per-signal contradicted state),
  `src/lib/__tests__/loadoutAssessment.test.ts`, `docs/tms-build-status.md`.
- Threshold stays 4; only what counts toward it changes.
- No schema change needed.
