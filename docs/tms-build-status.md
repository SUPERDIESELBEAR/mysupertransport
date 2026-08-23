# TMS Build Status — Handoff Summary

Date: 2026-08-22

## Built modules

| Module | Status |
|---|---|
| Loads list | List view with search, filters, and saved view preferences. |
| Create load | Full form with facility normalization, configurable load numbering, and broker/facility quick-add affordances. |
| Rate confirmation parsing | Separate AI-assisted parser on the Create Load form; extracts stops, charges, broker details, and reference numbers. Refinement pass built and verified — see below. |
| Load detail — Pass 1 | Read-only detail view. |
| Load detail — Pass 2A | Status controls and history timeline. |
| Load detail — Pass 2B | Driver assignment with eligibility checks. |
| Load detail — Pass 2C | Documents, loadout galleries, and document exceptions. |
| Load detail — Pass 2D | Claim flag management. |
| Facilities | Directory with normalization; shared by stop picker and load form. |
| Brokers | Directory with factoring filters, search, orphan deletion, and in-place edit affordances. |
| Load editing | `update_load_with_stops` RPC; tiered financial locking, audit history, and stop reconciliation to preserve driver check-in data. Financial change reason + classification required. |
| Revised rate con re-parse | Comparison review screen for revised documents. |
| Duplicate detection | Broker reference/MC duplicate warnings at parse and save time; overrides are audit-logged. |

### Rate confirmation parsing — refinements

- **Broker creation is confirmed, not automatic.** The extracted broker opens a pre-filled, fully editable dialog; the record is written only on explicit confirm. There is no one-click insert path.
- **Monetary inputs carry a currency prefix.** Display only — value handling, validation, and the submitted payload are unchanged.
- **Street suffix abbreviations drop trailing periods.** `ST.` renders as `St`, so addresses stay consistent regardless of how the broker printed them.
- **Internal capitals are preserved in names.** McCree, MacArthur, O'Brien, DeSoto. `Mc`/`O'` use a general rule; `Mac`/`De`/`La`/`Van` split only against an inclusion list, so ordinary words like Macon and Delaware stay flat.
- **Broker address extraction.** One address only, preferring remit-to over bill-to over letterhead, never assembled from two blocks. The dialog names the source heading, and a provenance line is appended to the broker's notes so the stored address's origin survives the save.

### Verbatim capture, references and accept defaults

- **Broker-authored text is stored as printed.** `loads.special_instructions_verbatim` and `loads.broker_terms_verbatim` are separate columns; `load_stops.stop_notes_verbatim` holds the printed stop comment. The terms paragraph is never concatenated into the Special Instructions block. Condensed text, if ever wanted, is a render-time derivation — never the stored value.
- **Transcriptions are checked against the PDF text layer.** `src/lib/verbatimVerify.ts` normalizes layer damage (entity chains, control glyphs, typographic quotes) without collapsing casing, scores a sliding window with Sørensen–Dice at a 0.99 threshold, and additionally requires every high-signal token in the matched window (emails, phones, money, long digit runs) to survive. Verdicts distinguish `layer_unreliable` (the document cannot render the block) from `unverified` (the model rewrote it) and `no_layer`.
- **References are rows, not a JSON blob.** `load_references` (class, label, value) with `load_reference_citations` recording which stop printed each one. Keyed on class + value, so a PRO that repeats the BOL value is its own row. Labels resolve through `src/lib/referenceClasses.ts`, which maps `PU#` and `Pickup Number` to one class.
- **Categorical labels are not references.** `Mode` routes to `loads.mode`; identifying classes only are eligible for duplicate detection.
- **Free-text changes arrive unchecked.** Structured before/after changes — dates, numbers, addresses, reference rows — stay checked; broker prose requires a deliberate accept.

## Key architectural decisions

- **`load_charges` is the authoritative charge record.** `stopoff_charge_amount` on `load_stops` is a display mirror used for quick rendering; write-time logic uses `load_charges`.
- **`current_profile_id()` resolves the actor's profile id.** All server-side TMS writers use it because `profiles.id` and `auth.uid()` are different values and every `created_by` / `updated_by` FK points to `profiles(id)`.
- **Financial changes require a reason and classification.** The form and RPC enforce this before accepting a save that alters what the broker is billed.
- **Stops reconcile by id.** Driver check-in data (arrival/departure, lat/long) is preserved across edits by matching existing stop ids rather than rebuilding the list.
- **Duplicate detection warns rather than blocks.** Duplicate broker reference/MC matches are surfaced as warnings; staff can override, and every override is written to the audit log.

## Test baselines

Figures from `src/test/helpers/gate.ts` and `src/test/README.md` (measured 2026-08-22). Both files agree. Every skip is named and counted; no silent `it.skip` or `test.skip`.

- **With database attached:** 535 passed, 2 skipped (68 files passed, 1 skipped).
- **Without database:** 516 passed, 13 skipped (65 files passed, 4 skipped).

## Open items

- **Unparsed rate confirmations:** Rolling River, MegaCorp, and Nationwide still need parser coverage.
- **33 query sites in `src/components/inspection/` swallow errors;** failures are not surfaced to the UI.
- **Parsed broker address is not applied to an existing broker record.** Extraction itself is built, but the address is only offered when a new broker is created from the document. When the dispatcher links an existing broker that has no address on file, the parsed address is discarded.
- **Load Detail page is read-only for stop-off amounts,** so the edit path that could orphan a `load_charges` row does not exist yet. The unit test for the clear-to-empty transition exists but is unwired.
- **`certify_rods_day` live RPC execution arm** cannot run in this environment and is one of the two permanent named skips.

## Verbatim verification: document-determined regions (2026-08-22)

Verification no longer slides a transcription-length window across the layer.
`src/lib/verbatimRegions.ts` cuts the region from printed structure — the field's
heading and the block it owns — so damage is one figure per field per document
regardless of what the model wrote. All three signals (similarity, tokens,
damage) are always reported, even when `layer_unreliable` is the headline.

### Final measurements, Blue Grace, both extractors

| Field | pdftotext | pdf.js (browser worker) |
| --- | --- | --- |
| Special Instructions | 5.84% damage, similarity 0.9929, verified | 5.71% damage, similarity 0.9929, verified |
| Broker terms | 0.00% damage, similarity 1.0000, verified | 0.00% damage, similarity 1.0000, verified |
| Stop notes | 0.00% damage, verified | refused (`region_unresolved`) |

The condensed paraphrase of the Special Instructions block scores **0.0436**
against its resolved region and fails both signals, dropping
`CALAVO@BLUEGRACEGROUP.COM` and `(800) 697-4477`. It is that low because the
comparator deliberately does not collapse casing and the printed block is
upper-case. Before regions were cut from the page it selected a cleaner window
in the broker-terms paragraph and scored 0.5531 against text it does not
correspond to.

`layer_unreliable` is rarer than the isolated measurement suggested. Damage only
decides the headline when a check actually fails: a faithful transcription of a
5.71%-damaged block still verifies. Damage is reported on every result either
way, so a damaged region is visible without being an accusation.

### Region boundaries

Blank lines cannot be the only boundary — `pdftotext` emits them, pdf.js does
not. Terminators are printed structures both extractors produce: `References`,
`Freight Terms`, `Items`, `Charge Details`, `Equipment & Services`, `Stop N`,
`Page N / M`, `Comments` (bare), `Comments:` (labelled), `Contact Information:`,
`Special Instructions`, `Bill To:`, and the appointment-window line
(`MM/DD/YYYY hh:mmAM …`). A 40-line cap is the backstop when none appears.

Two caveats, named rather than left to surface on the next broker:

- A blank line following content is still a secondary boundary, so `pdftotext`
  can end a region earlier than pdf.js on a document with no terminator between
  two blocks. That is the 5.84% / 5.71% difference on the same field.
- `Stop N` and the appointment-window line depend on ordering, which is what
  differs between extractors. For load-level fields the exposure is bounded — a
  misplaced line ends a region early or late, which surfaces as a similarity or
  token failure, never as a confident verification against another field's text.
  For stop-level fields it is not bounded, which is why they refuse.

### Open: stop-level verification is refused on misordered layers

pdf.js emits Blue Grace's first `Comments:` line *above* its `Stop 1 (pickup)`
heading, so slice 1 holds stop 2's comment. Rather than reconstruct reading
order from text-run positions — extractor-specific, layout-specific, and a
subtle error there verifies a field confidently against the wrong text — the
document is refused: `region_unresolved` with reason `comment_precedes_heading`,
for **every** stop on that document, not only the detected one.

Detection needs a stop left with no comment of its own, paired with an orphan
comment above the first heading or a slice holding two. A load-level `Comments:`
line while every stop still keeps its own is legitimate and is not refused.

The verbatim text is still captured and stored; only the verification is
refused. Every occurrence is logged through `recordAnchorMiss` with the observed
`Stop N` and `Comments:` line positions. That log is the data for deciding later
whether a bounded look-back is safe — nothing reads it automatically today.

---

## Parser diagnostics are persisted

`recordAnchorMiss` used to write to a module-level array that nothing read and
a page reload erased. Misses are now drained after every parse and written to
`public.parser_diagnostics`, with the field, the failure reason, the
heading-shaped lines the document printed, and the load and document they came
from. Readable at **/dispatch/parser-diagnostics** (Dispatch → Parser
Diagnostics), grouped by kind, with a "Mark taught" action once an anchor or a
label has been added to the map.

Three kinds are logged:

- `anchor_miss` — no heading matched the anchor set, or the region was ambiguous
  or empty.
- `reference_label_unrecognized` — a printed reference label the class map has
  never been taught. These now classify as `unclassified`, not `other`; an
  ABSENT label is still `other`, since an unlabelled reference is a real thing
  and not a miss.
- `reference_row_dropped` — a reference row the classifier discarded.

Only labels and headings are stored, never reference values: this log must not
become a second copy of broker-authored identifiers.

## Verification and references are read back on Load Detail

Stored verdicts render on Load Detail for any capture that is not plainly
`verified`, with the artifact list on expand, and a manually repaired span is
marked as such with who repaired it and when (server-stamped by
`set_load_verbatim_verification`). The load's reference rows render with their
class and stop citations, so a filed baseline is visible on the load itself
rather than inferable from a review screen showing no changes.

## Standing rule: verify every check is reachable from BOTH paths

Three gaps of the same shape surfaced in one night — `saveLoadReferences` with
no caller, verification absent from the revision path, and a log nothing read.
Each was a correct implementation with no invocation on the path that mattered,
and unit tests missed all three because they call the functions directly.

Every check is therefore tagged `@parser-check` in its JSDoc, and
`src/lib/__tests__/parserPathWiring.test.ts` discovers the tagged exports from
the tree, walks the import graph out from the create path
(`CreateLoadPage.tsx`) and the revision path (`RevisedRateConModal.tsx`), and
fails when a tagged function is not called anywhere reachable from either.
**A new check is not done until it is tagged and the wiring test passes.**

## Known revision-path gaps (deferred, not forgotten)

The revision path does not yet do these things the create path does:

- **Facility directory matching on an added stop.** A stop added by a revision
  is stored as the document printed it, with no suggestion from the facility
  directory.
- **Broker address prefill and provenance.** A revision that changes broker
  details does not prefill or record where the address came from.
- **Broker candidate matching or creation from a revision.** A revised document
  naming a broker not on file cannot link or create one; the load keeps its
  existing broker link.

Duplicate broker-reference detection is no longer on this list: a revision that
changes `broker_reference_number` now runs the same check as the create path
(current load excluded) and warns with the same override-with-audit behaviour.

## Standing rule: the actor is resolved server-side (2026-08-23)

`created_by` / `updated_by` / `changed_by` / `resolved_by` on the TMS tables are
foreign keys to `profiles(id)`. `auth.uid()` is the auth USER id — a different
uuid. Sending one where the other belongs raises 23503 at insert time, which is
how "File these as the load's reference numbers" failed on ST26034 with the whole
suite green.

- **No client write sends an actor id.** The database resolves it with
  `current_profile_id()`, either inside the RPC or as a column default.
- **A write that stamps an actor and also writes history is one RPC.** The
  baseline write was two round trips, so the failed history insert left ST26034
  with five reference rows and no history entry. `file_load_references` now does
  references, citations and the history entry in a single transaction; it
  replaces `record_load_reference_baseline`, which has been dropped.
- **`src/test/actor-stamp-fk.test.ts` enforces this.** It scans the resolved
  migration set for any `profiles(id)` column assigned `auth.uid()`, scans client
  writes for an actor sent from the browser, and drives the real save path
  against a fake that enforces the foreign keys and takes its RPC behaviour from
  the checked-in SQL (`src/test/helpers/pgFake.ts`). Mocks that accept any uuid
  are what let this class of bug through.

Audit of the writes introduced with the parser work:

| Write | Before | Now |
| --- | --- | --- |
| `record_load_reference_baseline` → `load_change_history.changed_by` | `auth.uid()` — failed 23503 | dropped; superseded |
| `file_load_references` → references, citations, history | did not exist | `current_profile_id()`, one transaction |
| `load_references.created_by` | never set | `current_profile_id()` |
| `set_load_verbatim_verification` → `loads.updated_by`, `checked_by`, `repaired_by` | `auth.uid()` — latent 23503 on `updated_by` | `current_profile_id()` |
| `parser_diagnostics.created_by` / `resolved_by` | client-sent `auth.uid()`, no FK | column default `current_profile_id()`, FKs added, `resolve_parser_diagnostic` RPC |
| `record_duplicate_broker_reference` | already `current_profile_id()` | unchanged |

## Standing rule: test a persisted shape at BOTH boundaries (2026-08-23)

**A persisted shape must be tested at both the writing and the reading
boundary, and the reader's fixture must be derived from the writer's actual
output, never authored independently.** A hand-built fixture only proves the
reader agrees with the test author.

`loads.verbatim_verification` is the case that forced the rule.
`set_load_verbatim_verification` stores an envelope —
`{ checked_at, checked_by, fields: [...] }` — because the load-level audit
stamp cannot live inside a bare array. `VerbatimVerificationCard` read the
column as if it were the array. Every writer-side test passed; the first load
with a real record (ST26035) threw `records.map is not a function` during
render and blanked the whole Load Detail route.

The envelope is canonical. The card normalises from it (and still accepts a
bare array, which is what in-memory review results are before they are
written). `src/components/dispatch/loadDetail/__tests__/verbatimVerificationCard.test.tsx`
builds its fixture by driving the real save path through `pgFake`, whose RPC
behaviour comes from the checked-in SQL, and reading the stored column back —
plus a contract test that the envelope keys the card reads are the keys the
migration writes. The fake used to store the array as given; that fiction is
what let the reader ship broken, and it now builds the envelope.

### One defect class, four instances

These read as four unrelated bugs and are not. Each is correct code, untested
at the seam where it is consumed:

1. `saveLoadReferences` — written, unit-tested, never called.
2. Verbatim verification — implemented, absent from the revision path entirely.
3. The anchor-miss log — written to memory, read by nothing, erased on reload.
4. `VerbatimVerificationCard` — rendered against a shape the writer never
   produces, because no `loadDetail` component had a test file at all.

The common failure is that unit tests exercise a function directly and never
the seam: the call site, the other path, the consumer. Wiring is covered by the
both-paths rule above; shape is covered by this one.

### Read-side rendering cover (2026-08-23)

| Component | Reads | Rendering test |
|---|---|---|
| `VerbatimVerificationCard` | `loads.verbatim_verification` | yes — fixture from the writer |
| `LoadReferencesCard` | `load_references` + embedded citations | yes — via the real fetch |
| `ParserDiagnosticsPage` | `parser_diagnostics` | yes — via the real fetch |
| `StatusHistoryCard`, `ChangeHistoryCard`, `ClaimsSection`, `DocumentsSection` | own queries | no — lower exposure, no shape translation |
| `LoadSummaryCard`, `RateDetailsCard`, `StopsTimeline`, `NotesSection`, conditional blocks | typed props from `fetchLoadDetail` | no — no persisted shape of their own |

Every Load Detail section is additionally wrapped in
`SectionErrorBoundary`: a card that throws degrades to an inline fallback with
the section name, the error and a Retry, and the rest of the load stays
readable. A render fault must never unmount the route again.

### The ref warning is dev tooling, not the app (2026-08-23)

`Function components cannot be given refs … check the render method of
DocumentsSection` is not a Load Detail defect. `lovable-tagger` — the
`mode === "development"` plugin in `vite.config.ts` — attaches a `ref` callback
to every tagged JSX element, so any function component without `forwardRef`
produces the warning. It fires 21 times on `/login`, which renders no load
code at all, and it is absent from production builds because the plugin is
not applied there. No ref is passed to `DocumentsSection` (or any other Load
Detail card) from application code; there is nothing to remove. Do not
`forwardRef` shadcn primitives to silence it.

A real duplicate-key warning was found in the same log and fixed: per-stop
captures repeat the field name, so `VerbatimVerificationCard` keyed rows on a
non-unique `field`-`verdict` pair.
