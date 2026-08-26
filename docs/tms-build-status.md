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
| Load Detail tab layout | Decided: Operations / Financials / Documentation / Audit & Claims; to be built when Module 5 lands. |
| Charges card placement | Lives after Rate Details today; goes under Financials with the tab work. The card takes only `loadId`, `operatorId` and `canEdit`, reads its own rows and holds no reference to its neighbours, so the move is a change of placement only. |
| Charge pay class | Every classification carries a pay class: `revenue` (percentage split) or `reimbursement` (paid at actual cost). Defaults live in `DEFAULT_CHARGE_PAY_CLASSES`; a policy may override via `pay_policies.charge_pay_classes`. Lumper stays `revenue` at 100% so no existing charge changed treatment — a driver-paid lumper is classified explicitly as "Reimbursement — driver-paid cost". Migrating lumper itself to the reimbursement class is a deliberate Phase 2 data decision, not an automatic reclassification. |

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
- **Two readers of the same parsed field share one gate, and a diagnostic never prints a value without reporting whether it survived.** The parse fingerprint read `appointment_start.value` raw while the form writer read the same field through the low-confidence gate, so the diagnostic showed both Rolling River appointment windows while both form fields were empty and nobody could see why. Every value a diagnostic prints now carries the confidence the gate reads, and `ApplyResult.discarded` names everything the gate refused. A value shown without its outcome is a bug, not a display choice. Enforced by `src/lib/__tests__/sharedConfidenceGate.test.ts`.
- **Confidence is a gate, so `low` is never returned with a value that passed validation.** The parser floors a validated appointment date to `medium`: if the document states it and it parses, it is a reading, not a guess. `low` means DISCARD, and returning `low` alongside a good value is how stated dates were deleted silently.
- **An inferred value carries its provenance in the database, not in the parse session.** `loads.loadout_use_window_source` (`document` | `derived`) travels with the trailer use window, so the "confirm with the broker" note survives a save and a reload. A hand-edit of either date flips it to `document` — a human decision is a stated one.
- **A pinned seed is not an acknowledged seed.** `run.seed_echoed` reports only whether the provider echoed the seed it was sent. Unacknowledged is reported as determinism unverified, never as pinned.


## Test baselines

Figures from `src/test/helpers/gate.ts` and `src/test/README.md` (measured 2026-08-22). Both files agree. Every skip is named and counted; no silent `it.skip` or `test.skip`.

- **With database attached:** 535 passed, 2 skipped (68 files passed, 1 skipped).
- **Without database:** 516 passed, 13 skipped (65 files passed, 4 skipped).

## Open items

- **Unparsed rate confirmations:** Rolling River, MegaCorp, and Nationwide still need parser coverage.
- **33 query sites in `src/components/inspection/` swallow errors;** failures are not surfaced to the UI.
- **Parsed broker address is not applied to an existing broker record.** Extraction itself is built, but the address is only offered when a new broker is created from the document. When the dispatcher links an existing broker that has no address on file, the parsed address is discarded.
- **Load Detail page is read-only for stop-off amounts,** so the edit path that could orphan a `load_charges` row does not exist yet. The unit test for the clear-to-empty transition exists but is unwired.

## Build order

The file records what is built and the rules learned; this section records the sequence and why it is the sequence, so the next session does not have to reconstruct it from conversation.

### Load Detail — future tab layout

Tabs will be introduced when Module 5 lands and there is a second financial section to sit beside Rate Details. The agreed grouping is:

1. **Operations (default)** — Load Summary, Stops, Reefer / Loadout / Flags blocks, Messages about this load, Status History.
2. **Financials** — Rate Details, Pay Policy (Module 4), Accessorials (Module 5), Fuel (Module 6).
3. **Documentation** — Documents, Reference Numbers, Verbatim Verification.
4. **Audit & Claims** — Claims, Change History, Internal Notes.

Note: Messages live in Operations while Documents live in Documentation. A document exception and the conversation about it will therefore appear on different tabs. That is acceptable and deliberate; it separates operational threads from the document record itself.

### Current state

- Module 1 — Owner-Operator Management: ~95% complete.
- Module 8 — Compliance & Documents: ~90% complete.
- Module 2 — Load Management: substantially built; parser, revision review, and duplicate detection are complete.

### Remaining sequence

1. **Messaging as a docked panel** — load-contextual threads available where the work is happening.
2. **Reimbursement pay class (Module 2 portion)** and **Phase 1 broker extensions** — carrier packet and signed broker-carrier agreement on the broker record, multiple broker contacts, do-not-load flag with reason and date, dispatcher notes and rating.
3. **Module 3 — Dispatch Board**, load-aware.
4. **Module 5 — Accessorials**.
5. **Module 6 — Fuel**.
6. **Module 4 — Settlement Engine**.
7. **Module 7 — Billing and Invoicing**.
8. **Module 11 — Driver App** settlement views, check-ins, document capture, expense submission.
9. **Module 9 — Reporting and Financial Intelligence**.
10. **Module 10 — Integrations**, except Motive HOS, which is pulled forward into Module 3 for driver availability.
11. **Driver Qualification Files** — a separate arc after the TMS is complete.

### Dependency reasoning

A settlement is linehaul plus accessorials minus fuel and deductions, so Modules 5 and 6 must precede Module 4. Module 7 needs settled loads. Module 11's settlement views need Module 4. Module 9 needs the other modules populated with real data. Building any of these earlier means building against empty tables.

### What must land with its module

Schema-shaped work is expensive to retrofit; view-shaped work is not. These must ship with the module that owns them:

- **Module 4** — chargebacks with signed authorization attached, the R&M Deposit statement (running balance, deposits, withdrawals), the reimbursement pay class payout rule, and the settlement preview with a driver dispute window.
- **Module 4 / Phase 2 reimbursement decision** — if lumper should move from the existing 100% percentage treatment to `reimbursement`, make that as an explicit data migration/review step. Do not infer it from the presence of `lumper_reimbursement_pct`, and do not automatically reclassify existing lumper charges.
- **Module 7** — short-pay tracking (invoiced versus received, with reason) and factoring reconciliation (submitted, funded, reserves held, fees).
- **Module 9** — broker scorecard, per-truck P&L, cash flow forecast, and Xero sync are view-shaped and can come later once the underlying modules are live.

### Deferred

Consciously postponed, not forgotten:

- Safety and compliance operations: accident register, structured roadside inspections, DataQs, drug and alcohol program, FMCSA Clearinghouse, annual MVR reviews.
- Tax and registration calendar: IFTA, IRP, Form 2290, UCR.
- Load templates and lane history.
- Load board integration.
- Recruiting analytics.


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

## Word-level fidelity and reference removal (2026-08-23)

### Similarity cannot see a corrupted word

On the ST26035 revision run the model transcribed `detention` as
`detentention` in an 833-character broker-terms block. Measured Dice bigram
similarity for that single inserted syllable: **0.9982**, against a 0.99
threshold. The capture read **verified**. Token presence did not help either —
`detention` is a word, not a token type the presence check extracts (numbers,
money, times, dimensions).

The fix is a membership check, not a lower threshold: `unknownWords` in
`src/lib/verbatimVerify.ts` extracts alphabetic words of 4+ characters from the
capture and flags any the region does not print. A non-empty list fails the
field regardless of similarity.

Asymmetry is deliberate. The text layer can only LOSE content, never invent it,
so it may be trusted to *demand* words it holds but not to *reject* words it
dropped. Where the layer renders damage — the Blue Grace pilcrow standing in for
`53' 102"` — a faithful capture necessarily contains words the layer lacks.
`damagedSpanAnchors` skips word checks adjacent to each damage marker, so the
faithful special-instructions capture on the same document still reads verified.

Measured after the change: broker terms with the typo → `unverified`, listing
`detentention`; special instructions (damaged region, faithful capture) →
`verified`. A word-by-word diff of the two captures of the same block found the
typo span and nothing else: no re-casing, no reflow, no paraphrase. The
"read the printed glyphs" prompt instruction is not producing edits beyond the
artifact spans, at least on this document.

### Removals write now, and are never pre-accepted

`file_load_references` takes `p_removals` and deletes those rows inside the same
transaction as the writes, logging each to `load_change_history`. Previously an
accepted "Reference removed" row only dropped the entry out of the form payload,
and the save path treats an absent reference as *not carried by this form*, so
the outdated number stayed on file and the row reappeared on every later review.
This is the same shape as the earlier write-path gap: **additions wrote and
removals did not.** Citations were checked for the same shape — the RPC rewrites
a reference's citations wholesale on every file, so a citation that disappears
from a revised document is deleted rather than lingering.

Removal rows now default to **reject**. A number missing from a revision has two
readings — the broker dropped it, or the parser failed to read it this run — and
the `detentention` capture shows the second is not hypothetical. Deleting a live
BOL number on the parser's unconfirmed word is the worse of the two mistakes.

## Rolling River, round two (2026-08-24)

### One writer for the load type

`load_type` is written in exactly one place: `useLoadTypeChange`. The Load Type
buttons and the parser's loadout banner both call it, so the amount carry, the
per-ton notice and the undo record apply identically no matter which control the
dispatcher used. The banner previously wrote `load_type` itself via
`applyLoadoutFields`, which is why "Yes — switch to Loadout" produced a $0.00
relocation fee while the Load Type button produced $150 from the same document.

**Standing rule — a state change with a rule attached gets exactly one writer.**
Reachability from both paths is not enough when the two paths reimplement the
change; the wiring test proves a check runs, and
`loadTypeCarry.test.ts` now also proves no file outside the hook writes
`load_type` through the form.

Undo is snapshot-based: the hook records every tracked field before and after
the change and restores the recorded values. Fields the parser fills — including
the trailer use window (`loadout_use_start` / `loadout_use_end` /
`loadout_use_period_days`) — are covered without being special-cased, and redo
replays the "after" snapshot so answering the banner twice never costs a
re-parse.

### Per-Ton Bulk is not a discarded rate

Standard and Per-Ton Bulk share `linehaul_rate`, so switching between them
carries nothing by design. What Per-Ton Bulk does is force `rate_type =
'per_ton'`, which hides the flat amount and makes the total `rate_per_ton x
tons` = $0. That reads as a lost rate. The switch now says so, and the per-ton
block shows the retained flat amount.

### Placeholder vocabulary reaches stop references

`pickReference` — the stop-level path — now applies
`isPlaceholderReferenceValue`, which previously only ran inside
`classifyReferences` on the load-level list. That is why "Assign at pickup" kept
landing on Stop 1 after the vocabulary was added.

### Anchor findings (recorded, no anchors added)

Held for the three-document anchor design rather than patched one broker at a
time:

- Rolling River prints **no "Stop N" headings at all** — stop slicing has
  nothing to cut, which is `stop_not_found`, structurally different from a
  `Comments` heading missing its colon.
- `broker_terms` → `anchor_not_found`: no printed heading matched the terms
  anchors on this document.
- Standing note: an anchor set that assumes stop headings exist cannot serve
  documents that number their stops only inside a table.

## An empty audit query is not evidence (2026-08-23)

`information_schema.role_table_grants` shows only grants the *querying role* is
party to. Queried as a limited role it returns almost nothing, and reading that
emptiness as "no table has grants" produced a defect report where there was no
defect. A migration was nearly written on top of it.

- Rule: an audit query that returns empty for almost every object is a
  suspected bad source, not a finding. Prove the query can see a case you
  already know is true before trusting the negatives.
- For privileges, ask the catalog a direct question:
  `has_table_privilege(role, oid, 'SELECT')`. That is what
  `public.grant_parity_report()` uses, evaluated at call time, so it cannot go
  stale the way a checked-in snapshot or migration-text scan does.
- `src/test/grant-parity-live.test.ts` runs that function against the live
  database and asserts zero offenders. A snapshot would inherit exactly the
  weakness this rule exists to name.

## The real cause: a bulk insert must have one key set (2026-08-23)

Zero diagnostics rows landed for Rolling River. The cause was not permissions.
The placeholder-reference work added a *second row shape* (dropped references)
to the same diagnostics batch as anchor misses, and PostgREST rejects a bulk
insert whose objects do not share a key set (PGRST102). The whole batch failed.

- A fix in one area silently disabled a diagnostic in another, and the panel
  read the resulting zero as success.
- `normalizeDiagnosticRows` now widens every row to `FULL_ROW_KEYS` before the
  insert, so a mixed batch is still one shape.
- `logParserDiagnostics` returns `{ collected, written, error }`. The panel
  states both numbers. Zero written is reported as success only when zero were
  collected and nothing on screen is unresolved; otherwise it is a failure with
  a persistent message, not a toast that flashes and vanishes.

## Low confidence means DISCARD, not flag (2026-08-23)

The form writer drops every value returned at `low` confidence. A field the
model returns at low confidence is therefore a field that is silently deleted —
the dispatcher never learns it existed. This is why both Rolling River stop
appointment dates disappeared between runs: a date printed without a clock time
came back low.

- `medium` is the correct level for anything the document states but the model
  cannot fully qualify: it fills the field *and* lists it for verification.
- Reserve `low` for values that would be better blank.
- Anywhere the prompt assigns confidence, this must be stated in the prompt
  itself. The name does not communicate the behaviour.
- Date-only appointments now normalise to midnight at `medium` rather than null.

## Runs are pinned and fingerprinted (2026-08-23)

Sampling is pinned (`temperature: 0`, fixed seed) so a difference between two
runs of one document means the document or the extraction moved, not the dice.
Whether the provider honours the seed is *reported* (`seed_echoed`), never
assumed. Each run carries a fingerprint — text-layer hash plus per-field
outcomes — so two runs can be compared directly, and a matching layer hash with
differing field outcomes isolates the model as the variable.

## A build identity nobody types, and a feature that does not depend on one model answer (2026-08-24)

Three "missing content" symptoms in the parse panel — model unknown, no confidence
brackets, no discarded list, appointment end times gone — were one cause: a stale
bundle plus an edge function frozen behind its source. A fourth symptom, the loadout
banner disappearing on a document that had shown it three times, was a separate and
worse problem.

### The contract number must move in the same change as the shape

The `run` envelope was added to the response without bumping `contract`, so a deploy
frozen before that change answered "contract 4" — exactly what the client expected —
and the divergence guard passed while returning no run metadata at all. Two rules:

- Bumping `contract` is part of the same edit that changes the response shape, never a
  follow-up.
- The guard checks the envelope it reads is PRESENT, not just that a version number
  matches. `parserContractWarning` now reports a missing `run` as divergence.
- `parser_build.code_hash` is derived from the build's own content (contract, model,
  sampling, prompts). A build identity a human types can be stale while the code moves;
  a derived one cannot.
- Auto-deploy has now failed to pick up this function twice. Deploy it explicitly and
  confirm with a real request that reads `parser_build` and `run` back.

### The client build is on screen next to the parse

The fingerprint panel prints the client build id and the parser build. Two stale-build
reports could not be told apart from the screen; now they can.

### A feature may not be gated on one non-deterministic answer

`assessLoadout` was a pure function of the model's `loadout_signals`, and the UI block
was gated on `suspected`. The same document scored 4 three times and under 4 once, and
below the threshold the panel rendered nothing — so the Loadout switch, and with it the
derived trailer-use window that runs inside the load-type change, became unreachable.
Standing rule: **a scored assessment renders its result on every run, including "not
suspected", and the action it guards stays reachable.**

Scoring now reads two independent sources — the model's signals and the printed text
layer — and a signal fires if either sees it, tagged with which one did. Where they
disagree, both are shown rather than one winning. Every parse writes a
`loadout_assessment` diagnostic row with the score and per-signal sources, so drift has
a record: logging only failures is why the earlier drift was invisible.

### Rolling River, verified against a real parse (not predicted)

Deployed contract 5, code_hash 4f39d6ae. `run` = google/gemini-3-flash-preview,
temperature 0, seed 20260823, **seed_echoed false** — the provider does not acknowledge
the seed, so determinism stays UNVERIFIED, not done. Stop appointments came back
2026-08-17T00:00 and 2026-08-24T00:00, both `medium` (the floor works, both fields fill);
end times were null this run. Loadout score 4 of 10: relocation language from model and
document, `no_commodity` from the model only — the printed page shows a Commodity value,
which is now reported as a model/document disagreement instead of being hidden.

## Determinism is unverified on this provider, and a contradicted signal does not score (2026-08-24)

### Determinism: unverified, not achieved

The seed is sent and the provider does not echo it (`seed_echoed: false`). Pinning
`temperature: 0` reduces run-to-run variance; it does not eliminate it, and nothing on
this gateway lets us prove a run is reproducible.

Consequences, and they are rules:

- `special_instructions_verbatim` returning a value on one run and null on the next is
  **expected variance on this provider**, not a bug to chase.
- The correct response to a field that varies between runs is to make the variance
  **visible** — the run fingerprint and the `parser_diagnostics` rows do this — never to
  loosen, retune, or add anchors to compensate. Tuning against noise moves the noise.
- Two runs are compared by text-layer hash first. Identical hash with differing field
  outcomes isolates the model as the variable and needs no further investigation.

### `appointment_end` is optional by contract

A single printed time fills `appointment_start` and leaves `appointment_end` null; a range
fills both. Nothing computes a duration from the end: the stops timeline displays
start-only when it is absent, and the loadout use-window derivation reads whatever stop
dates exist. So a run that returns start only is a valid parse and loses nothing. If
anything ever needs an end to compute with (a detention clock is the obvious candidate),
it derives or asks for one explicitly rather than assuming the parse supplied it.

### A signal the document contradicts does not count toward the threshold

`assessLoadout` scored `model || document`, so the printed page could only add a firing,
never withdraw one. On Rolling River `no_commodity` fired from the model while the page
prints a Commodity value, and that single point was the difference between 4 (suspected)
and 3 (not). Standing rule: **a fired signal the read text layer actively contradicts is
shown with its reason and scores zero.**

- Suppression applies only when a text layer was actually read. `document === null` means
  no layer, which must never silence a model signal.
- The withheld points and the score-if-they-counted are printed in the panel, so a
  dispatcher can see why a document sits under the line, and are written to the
  `loadout_assessment` diagnostic row per signal.
- Rolling River now reads an honest 3 of 10, "not suspected", with "Switch to Loadout
  anyway" reachable — which is what an always-rendered assessment is for. It is a loadout;
  the printed page does not say so; the human decides.

### Standing operational note: deploy this function explicitly

Auto-deploy has now missed `parse-rate-confirmation` **twice**. Treat an explicit deploy as
required, not optional, and confirm it with a live request that reads `parser_build.contract`,
`parser_build.code_hash` and the `run` envelope back.

## A check the reader cannot act on belongs in diagnostics, not on the parse screen (2026-08-24)

Four broker documents parsed cleanly and the verbatim verification block produced one
actionable message out of four: a pilcrow standing in for `53' 102"` on Blue Grace.
The other three were a missing-token failure naming a dollar figure that was correctly
extracted and visible in a field on the same screen (Nationwide), a 72.2% similarity
failure whose repair box asked a dispatcher to retype ~1,700 words of legal terms
(MegaCorp), and three "field not found on the page" verdicts with no available action
(Rolling River).

Standing rules:

- **A warning the reader can neither interpret nor act on degrades trust in the output
  around it.** It is worse than showing nothing. Audience is part of the design of a
  check, not an afterthought.
- **Verbatim verification is operator-facing, not dispatcher-facing.** It still runs on
  every parse, still persists to `loads.verbatim_verification`, and still writes
  `parser_diagnostics` rows. It is read on the Load Detail verification card and the
  Parser Diagnostics page, which staff open deliberately.
- **The parse screen shows only what is actionable or diagnostic-by-request**: extracted
  values, the "Verify these against the document" chips, the broker card, rate lines
  needing a decision, the loadout assessment, the diagnostics count, and the parse run
  fingerprint behind a toggle.
- **The repair affordance lives on the revision path only, gated on
  `transcription_damaged`.** That is the only path where accepting a capture overwrites
  text already stored on the load. On the create path a capture replaces nothing.
- **The stored verbatim text is a convenience copy for search and display, never the
  authority.** The rate confirmation PDF is attached to every load and is what staff open
  when a charge is disputed.
- **A parser-bookkeeping line must not read as a dispatcher error.** The diagnostics count
  is toned as a warning, not a failure, and says explicitly that the extracted fields and
  the load in progress are unaffected when the log itself did not record.

Nothing was deleted: `verbatimVerify.ts`, `verbatimRegions.ts`, `verbatimCheck.ts`,
`VerbatimRepairField.tsx` and every test remain. The checks found four real defects this
week; they were aimed at the wrong audience, not wrong.

## The page is the source where the page is clean (2026-08-24)

Stored verbatim text now comes from the PDF's own text layer whenever the field's
region resolves, carries no corruption marker, and passes a truncation check. The
model's transcription is the fallback, not the default.

### The layer is not automatically better

Blue Grace's Special Instructions block is the standing counterexample: the layer
renders `53' 102"` as a pilcrow, the model reads it correctly. Adopting the layer
there would store the exact corruption the `transcription_damaged` verdict was
built to catch, so adoption is refused on ANY corruption marker in the region —
pilcrow, control character, entity chain, replacement character — not on a damage
share alone. One pilcrow in an 800-character block is 0.1% damage and would have
cleared a share-based limit. Measured on that document: special instructions
falls back (region damage 4.98%, artifacts present), broker terms adopts (0%).

### Region boundaries are now the stored value's boundaries

A region cut two lines short used to cost a similarity point. Under adoption it
would cost stored text, silently, because the value matches the page by
construction. Three sanity checks refuse the region, any one of them sufficient:

- `shorter_than_model` — region under 90% of the model's normalized length
- `model_continues_past_region` — the model's last 30 characters are not inside
  the region, i.e. the model read past the boundary
- `ends_mid_sentence` — the region's last line breaks on a comma, colon, or a
  dangling function word

A refused region falls back to the model, which is the previous behaviour, so the
failure mode of this guard is "no improvement", never "worse than before". The
verdict for a refused region is `region_boundary_uncertain` (stored as
`region_truncated` before 2026-08-24; both tokens still render). It was renamed
because the condition is not shortness: MegaCorp's broker terms region is 335% of
the model's length and is still refused, on `model_continues_past_region` plus
`ends_mid_sentence`.

### There is no upper bound on the length ratio, by design

`MIN_RATIO = 0.9` is a floor only, and it exists to tolerate whitespace reflow. A
region LONGER than the model's transcription is never refused for that reason
alone — a model that drops 40% of a block produces exactly that shape, and that is
the case adoption was built for. Nationwide's special instructions adopt at a 167%
region/model ratio with no signal firing; the model had returned 1,071 characters
against the page's 1,784 and dropped both `$1,600.00` and a support address that
the stored page text now carries. Refusal must always name a signal.

### Origin is recorded per field

Every check carries `valueOrigin`, `originReason`, `modelValue`,
`layerLengthRatio` and `truncationSignals`, persisted with the rest of the
verification record and rendered on Load Detail. Note the deliberate split:
`verdict` always judges the MODEL's transcription against the page, while
`valueOrigin` says what the load actually stores. A field can read `unverified`
and still store the page's own text — that combination is informative, not
contradictory.

### Standing rule

Adoption runs BEFORE the parse is applied to the form and before the revision
diff is built. A screen fed from the pre-adoption parse would show a dispatcher a
value the load will not hold, and their approval would then attach to text that
was never stored.

### Origin is readable off a run, without saving

The origin rows render inside the collapsed parse-run fingerprint on both the
create path (`RateConfirmationParser`) and the revision path
(`RevisedRateConModal`), via one shared `VerbatimSourceRows`. Per field: source,
reason, region/model length ratio, truncation signals, and a stored-text preview
that quotes a window around the first dollar amount and the first email address
in the stored value. Those two matches are quoted specifically because a dropped
amount or address is what adoption exists to recover, and confirming it must not
require saving a load.

### Standing rule: a signal must not re-derive what the parse already extracted

`no_commodity`'s document side used to be an independent regex over the text
layer. It was wrong in both directions on real documents — it fired from
`(document)` on MegaCorp, where the model had already extracted `Plastics`, and
was correct on Rolling River only because that page prints `Commodity: paper
rolls` inline. A second scan re-deriving a fact the parse already established
cannot be more reliable than the extraction. The document side now answers from
`load.commodity` where a non-placeholder value exists, falls back to a widened
label scan (commodity / commodities / freight description / description of goods
/ product) only when nothing was extracted, and stays `null` when there is
neither — unknown never silences a model signal.

## Standing rule — one test drives the whole path

`src/test/e2e/blueGraceLoadPath.test.tsx` runs the Blue Grace tender through the
real create path (verification → adoption → form population with the real zod
resolver → `create_load_with_stops` → references → verbatim envelope →
diagnostics) and the real revision path (diff → decisions → `update_load_with_stops`
→ reference removal), and asserts on **rows in `pgFake`**, which enforces the
real foreign keys and takes its RPC behaviour from the checked-in SQL.

Rules that follow from it:

- **Assert on stored state, not on the return of the function you just called.**
  Every joint defect so far passed its own unit test and failed at the boundary.
- **Only the network may be stubbed.** In this file that is the parse edge
  function, the pdf.js text layer, storage, and React rendering of the two
  screens — nothing else, and everything downstream of each stub is real.
- **When a save path gains a column, an RPC, or a list operation, it is added to
  `pgFake` in the same change**, mirroring the migration. A fake that stores
  what the caller sent rather than what the SQL writes is how the
  `verbatim_verification` envelope shipped unreadable.
- **Fixtures are derived from a real stored parse, never authored.** The Blue
  Grace fixture is the stored parse of load ST26035 — MIXED PRODUCTS,
  1224 / 176 / 1400, Laredo TX to Garland TX, reefer at 38F. An earlier version
  invented seven fields, including a `DEL#` stop label the document never
  prints, so the stop-citation assertion was passing against a case that does
  not occur. A fixture value is never tuned to make an assertion pass; it is
  re-derived from the stored row.

### What this test does NOT cover

The end-to-end test stops at the database row. It asserts the shape the
**writer** stores, and React rendering is stubbed, so **no component renders
against stored data anywhere in the end-to-end suite.**

That is why it would **not** have caught the `verbatim_verification` envelope
bug: the writer was correct and the *reader* assumed a bare array. What catches
that class is a reader-boundary test —
`src/components/dispatch/loadDetail/__tests__/verbatimVerificationCard.test.tsx`
renders the card against the writer's own output — and that covers exactly one
card. Reader correctness for every other component that consumes stored parse
state is uncovered. Stated here as a known limit, not counted as coverage.

### Why Blue Grace's special instructions read `verified`

The text layer renders `53' 102"` as `¶`; the model resolved it back. So the
damage is in the LAYER and not in the transcription: `layerDegradation` is
non-zero, `transcriptionDamage` is null, and the verdict is `verified` at
similarity 0.9929. A damaged layer refuses **adoption** — the value is kept from
the model rather than taken from the page — it does not condemn the capture.
Both halves are pinned in the end-to-end test so a later change that starts
flagging the transcription fails there.


## Broker directory, Phase 1 relationship layer (2026-08-25)

What the broker record now carries, and what it deliberately does not.

**Extends, does not duplicate.** `broker_documents` already had the right shape
for paperwork, so the carrier packet and the signed broker-carrier agreement are
rows there under the `carrier_packet` and `signed_broker_agreement` categories.
`brokers` carries only the state flags — completed / signed, when, by whom, and
the id of the signed agreement document. No parallel document store was added.
`broker_factoring_history` was the model for `broker_do_not_load_history`.

**Do-not-load is separate from factoring status.** A broker can be factorable and
still be one SUPERTRANSPORT refuses to haul for. The warning at load creation is
rendered by `BrokerSelect` from the record `useBrokers` already holds in memory.
The load save path, the load RPCs, the parser and the revision code are all
untouched by this pass — that was the condition for building it here. An override
is an `audit_log` row with the reason, matching duplicate-broker detection.

**Two note surfaces is one too many.** `brokers.notes` is legacy text with no
author and no date. It is displayed read-only with a line pointing at the
attributed note field below it, and is not migrated: inventing an author or a
date for it would be worse than leaving it labelled. `broker_notes` is a running
attributed record, not an overwritten opinion blob.

**Actor columns are stamped, not accepted.** `stamp_brokers_actor()` and
`stamp_broker_child_actor()` overwrite whatever the client sent, per the standing
server-side actor rule. The rating trigger names the field and the allowed range
in its message so the dialog surfaces something readable through
`getDbErrorParts`.

**Author-scoped policies may not call `current_profile_id()`.** `authenticated`
cannot execute it, so a policy that calls it fails closed and the author can
neither edit nor delete their own note. The profile is resolved inline in the
policy instead. `src/test/caller-evaluated-functions.test.ts` is the guard that
caught this; check it before writing any new author-scoped policy.

**Not in this pass.** The computed scorecard — rate per mile, detention approval
rate, short-pay frequency, days to pay — is Module 9. It reads load and invoice
data that does not exist yet. This pass captures the human judgment only.

## Rate con email ingestion — a second front door (2026-08-26)

Rate confirmations can now arrive by email at a dedicated Resend inbound
address; they land in a shared dispatch inbox already parsed, verbatim-checked,
and adopted. Manual upload on Create Load is unchanged and remains first-class.

**The parser is invoked in-process, not over HTTP.** The AI call, prompt,
sampling, normalization, and result construction moved out of
`parse-rate-confirmation/index.ts` into `_shared/rateConCore.ts`; the edge
function is now a thin bearer-auth wrapper, and `receive-rate-con-email` calls
the same core directly. No internal shared secret exists — a secret that lets
any caller reach the parser as staff was refused as a new public attack
surface.

**Verification runs server-side, before storage.** The verbatim primitives
(`verbatimRegions`, `verbatimVerify`, `verbatimAdopt`) moved to
`_shared/verbatim/` with `src/lib` re-export shims, so edge and browser run
one implementation. The ingest function extracts the text layer itself with
pdfjs 5.7.284 — the exact version the browser uses, with minimal DOMMatrix /
Path2D stubs the legacy build references at module scope — then runs the same
verify-then-adopt judgment. A PDF with no extractable text layer logs loudly
and stores `no_layer` checks; that is a defect signal, not a normal case.

**The two paths are pinned equal by a permanent test.**
`src/lib/__tests__/ingestVerbatimEquivalence.test.ts` drives the browser judge
(`judgeParsedVerbatimWithLayer`) and the server judge
(`judgeParsedVerbatimServer`) with the same parse and the same layer on the
Blue Grace tender, and asserts identical verdicts, origins, adopted values,
and adopted parses — including the no-layer case. The Nationwide document has
no fixture in this repo; when one exists it joins this test.

**Every email creates a queue item.** Junk, portal-link mail with no PDF, and
mail to the wrong address all land as dismissible `needs_manual` items — a
silently dropped email reads as "never sent". Redelivered webhooks collapse on
`resend_email_id`; the same attachment forwarded twice collapses on SHA-256
(the duplicate is dismissed WITHOUT writing the hash — the partial unique
index would reject it). A parsed item whose broker reference matches a load
created manually is marked `auto_handled` — both by an ingest-time lookup and
by a trigger on `loads.broker_reference_number` for loads created later.

**The queue is shared.** Any dispatcher/management/owner reads and updates
`rate_con_ingest_queue`; there is no routing and no claiming. The sidebar
count badge on Rate Con Inbox is the only notification. "Create load" on a
parsed item carries the stored attachment and the server-verified parse to
Create Load as a one-shot handoff (`ingestHandoff.ts`, five-minute expiry) —
the form runs only its application half; the document is never parsed or
verified twice. A successful create marks the item `converted`.

**Webhook security.** Svix signature verification (`svix-id` / timestamp /
signature, HMAC-SHA256, 5-minute replay tolerance, constant-time compare)
against `RESEND_WEBHOOK_SECRET`. Attachment bytes are fetched from Resend
authenticated with the existing outbound `RESEND_API_KEY`, bounded at 30 MB,
stored in the private `rate-con-ingest` bucket (staff-read via signed URL).
