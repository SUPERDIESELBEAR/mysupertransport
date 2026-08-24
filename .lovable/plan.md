# Rolling River pass — appointments, trailer use window, run metadata, naming

Four items. Two are reader/writer disagreements the fingerprint separated; one is a fill rule; one is naming.

## 1. Appointment dates parsed then lost

Verified in the code, not assumed: `buildParseFingerprint` reads `stop.appointment_start.value` **unconditionally** (`src/lib/parseFingerprint.ts`), while the form writer `applyParsedToForm` reads it through `usable()`, which returns null for `confidence: 'low'` (`src/lib/rateConfirmation.ts`). So a value can print in the fingerprint and never reach the form. That is the only divergence between the two readers of the same field, and it matches the symptom exactly: both windows present in the fingerprint, both fields empty.

What is not yet confirmed is which confidence came back for these two stops. The 12:00 AM to 11:59 PM shape is the model synthesising a full-day window from a printed date with no clock time, and the edge function's `dateTime` normalizer only floors date-only strings to `medium` — a value that already carries a time (`00:00`, `23:59`) keeps whatever confidence the model assigned, including `low`. That is the likely path.

Fixes, in order:

- **Make the drop visible.** The fingerprint records the confidence alongside each appointment value, and any field the confidence gate discarded is listed in the panel as *read but discarded* with the field name and the value that was thrown away. A silent discard is what cost this round-trip; the fingerprint should not be able to show a value the form does not have without saying so.
- **Floor appointment confidence in the normalizer.** An appointment value that survives date/time validation is a value the document states. `dateTime` never returns `low` when it has a parseable value — `low` becomes `medium` (fills, and lists for verification). `low` stays reserved for unparseable or absent.
- **Verify by re-parse** on the fixed build and report the confidences the fingerprint now shows next to whether both fields filled.

## 2. Trailer use window on the loadout switch

Today the window is filled only from `loadout_signals.use_start_date` / `use_end_date` / `use_period_days`, and only at non-low confidence. Rolling River prints no explicit window, so all three stay empty.

New derivation, applied inside `useLoadTypeChange` so it belongs to the same single reversible operation (and is therefore covered by the existing Undo):

- If the document states a window, use it. Otherwise derive **from the first stop's appointment date through the last stop's appointment date**.
- The two dates are the authoritative display, shown prominently. Each derived row carries the provenance line verbatim: *Derived from the pickup and delivery dates on the document — confirm with the broker.* The wording stays exactly that — it names the inference instead of implying the broker granted a window they never stated.
- The provenance is **persisted with the load**, not held only in the parse session: a `loadout_use_window_source` value of `document` or `derived` on `loads`, so Load Detail shows the same line every time the load is opened, on the create path and the revision path alike. A window a dispatcher edits by hand flips the source to `document` (a human confirmed it) and the line disappears.
- Derivation only runs when the parse actually has both dates. No dates, no guess.

**Day count — resolved to informational, per your note.** A broker saying "you can keep it eight days" and a broker saying "the 17th through the 24th" are not reliably the same count, and inclusive vs. elapsed differs by one. So the count is not authoritative anywhere:

- The dates are the record. The count renders beside them as informational text — *8 days (17th through 24th, inclusive)* — with the convention stated in the text itself so it can't be misread.
- When the document states `use_period_days` outright, that number is authoritative and is shown as stated, with no derived count competing with it.
- The dispatcher can still type a count; a typed count is authoritative and stops being derived.
- If the stated days and the stated dates disagree, both are shown with the disagreement named rather than one silently winning.


## 3. Fingerprint reports model unknown, no run id, sampling unknown

This is a reader/writer shape mismatch, not a missing gateway field. The edge function attaches everything under a single `run` object:

```text
result.run = { model, temperature, seed, seed_echoed, system_fingerprint }
```

`buildParseFingerprint` looks for `parsed.model`, `parsed.system_fingerprint` and `parsed.sampling.pinned/seed` — three keys that do not exist on the response. So the values are being sent and not read.

Fix: read `run`, and surface `seed_echoed` as its own line. That flag is the honest answer to whether the gateway acknowledged the seed — if it comes back false, the panel says *the provider did not acknowledge the seed or return a run id, so determinism is unverified on this provider* rather than implying pinning is working. Whichever way it reports on the re-parse, that is what gets recorded in the build status doc.

## 4. Rename "Relocation fee" to "Relocation pay"

Renamed in every user-facing surface: the create/edit form label, the day-count and window labels' surrounding copy, the load type carry toast ("Carried $150 over as the relocation pay"), Load Detail rate and conditional blocks, and the change-history field label.

**The database column stays `loadout_relocation_fee`.** Renaming it would touch the loads table, the save payload, the edit hydrator, the revision diff field map, the change-history key map and existing history rows whose stored field names would stop resolving to a label. The column comment is updated to state it is revenue paid to SUPERTRANSPORT, of which the driver receives a percentage.

## The banner evidence line you asked about

Confirmed read from the document, not assumed. "The carrier may keep the trailer for a period of days" is printed only when `loadout_signals.multi_day_use_period` is true, which the parser prompt defines as *true if the carrier may keep/use the trailer for a period of days* — a per-document boolean, absent by default. It is not a constant for all loadouts.

## Technical notes

- `src/lib/parseFingerprint.ts` — read the `run` envelope; record appointment confidence; add the discarded-by-gate list.
- `src/lib/rateConfirmation.ts` — `applyParsedToForm` returns the fields the confidence gate discarded so the panel can name them.
- `supabase/functions/parse-rate-confirmation/index.ts` — `dateTime` floors a parseable value to `medium`; parser contract bumped and the client's `EXPECTED_PARSER_CONTRACT` bumped with it.
- `src/components/dispatch/loadForm/useLoadTypeChange.ts` — derived use window and day count as part of the single load-type change.
- `src/components/dispatch/loadForm/RateConfirmationParser.tsx`, `src/pages/dispatch/CreateLoadPage.tsx`, Load Detail cards — labels and the new panel lines.

## Tests

- A stop appointment returned at `low` with a parseable value fills the form after the normalizer floor, and the panel lists nothing as discarded.
- A genuinely discarded field appears in the discarded list with its value — the fingerprint can no longer show a value the form lacks without reporting it.
- The fingerprint reads model, run id and seed from the `run` envelope, and reports determinism unverified when `seed_echoed` is false.
- Loadout switch with no stated window derives 08/17 through 08/24 and a day count of 8; with no parsed dates it leaves all three empty; Undo restores all three.
- Both paths: the derived window and the discarded-field report are asserted reachable from the create path and the revision path, per the standing rule.
