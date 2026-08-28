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

Figures re-measured 2026-08-26 and written into `src/test/helpers/gate.ts` and
`src/test/README.md`; all three files now carry the same measured figures. Before
this re-measurement the three disagreed: gate.ts and this file recorded 535 / 516,
README.md recorded 551 / 532, and the sentence here claiming gate.ts and README.md
agreed was false. Every skip is named and counted; no silent `it.skip` or
`test.skip`.

- **With database attached:** 738 passed, 7 skipped (96 files passed, 2 skipped).
- **Without database:** 713 passed, 24 skipped (91 files passed, 7 skipped).

The no-database skip count moved from 13 to 19 because two live-catalog suites
added since the last measurement — `caller-evaluated-functions` (3) and
`grant-parity-live` (3) — each register named PGHOST gates. Every one of the 19
is named in the run output; no gate regressed to `runIf`/`skip`.

## Open items

- **Unparsed rate confirmations:** Rolling River, MegaCorp, and Nationwide still need parser coverage.
- **33 query sites in `src/components/inspection/` swallow errors;** failures are not surfaced to the UI.
- **Parsed broker address is not applied to an existing broker record.** Extraction itself is built, but the address is only offered when a new broker is created from the document. When the dispatcher links an existing broker that has no address on file, the parsed address is discarded.
- **Load Detail page is read-only for stop-off amounts,** so the edit path that could orphan a `load_charges` row does not exist yet. The unit test for the clear-to-empty transition exists but is unwired.

## Dispatch operating model

This section records how SUPERTRANSPORT actually dispatches, so Module 3 is built against the real operation rather than a generic TMS assumption.

### Freight source

SUPERTRANSPORT has no direct customer freight. Dispatchers plan routes and book spot-market loads off DAT and Truckstop. Every load is booked intentionally for a specific driver — this is not a pool of loads matched against a pool of drivers. Assignment records a decision that was already made; it does not make one.

### How a load gets to a driver

The dispatcher and driver discuss options by phone or message and agree a plan. Some drivers give their dispatcher an open playbook and do not want to be consulted. There is no formal offer-and-accept step and one should not be built — it would add a step to a conversation that already happened.

### How the rate confirmation arrives

After negotiating, the broker emails it. It goes to the dispatcher directly, to dispatch@mysupertransport.com, or occasionally to the CEO's address because that address is on the USDOT filing and some brokers will not send anywhere else. Some brokers send a portal link rather than a PDF, so ingestion cannot be the only path and manual upload stays first-class.

### Driver-to-dispatcher relationship

The relationship is permanent, not per load. A dispatcher covers a set of drivers, needs to see just those by default, needs to see all activity, and needs to cover for another dispatcher when someone is out.

### Loads booked ahead

A driver typically has one or two loads booked beyond the current one; more is possible and the board must not cap it. Order matters — the board shows the queue in delivery sequence so a dispatcher can see whether the chain is feasible. A load delivering Thursday in Garland followed by one picking up Friday in Atlanta is a problem the board should make visible rather than leaving to arithmetic.

### Availability is not the same as needing work

A driver at home may be home by request. Home time is driver-initiated: they ask, SUPERTRANSPORT routes them a load toward home, and they give a day or two notice on when they want to be re-dispatched. So home time needs a requested date and an expected re-dispatch date. The signal that matters is not "who is home" but "who has no load booked and is not deliberately off."

### Driver status sources

- **Dispatched** should be derived from loads, not typed.
- **Load progress** — at shipper, loaded, delivered — comes from the driver in the app; drivers already scan PODs and BOLs in their current TMS, so document capture is an existing habit rather than a new behaviour to establish.
- **Home time, breakdown, out of service and compliance hold** require a human because no load record implies them.

### The current Dispatch Board

The current Dispatch Board is a driver availability calendar — status per driver, day counts, home/dispatched/broke-down, a status alerts banner. It is in daily use and works. Module 3 does not replace it. Rename it **Driver Status** and build the load-aware board as a separate page.

### Driver preferences

Driver preferences are currently unwritten and live in dispatchers' heads: route preferences and equipment willingness. Capturing them belongs in onboarding, expressed as named regions rather than whole states — a driver who avoids New York City is fine with Buffalo, one who avoids Miami is fine with the panhandle — plus a reefer-versus-dry-van flag. Deferred, not part of Module 3.

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
10. **Module 10 — Integrations**.
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
- Motive integration. HOS availability matters more than truck position — position tells a dispatcher where a driver is, hours tell them whether the driver can legally take the load being considered on DAT.


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

## Standing rule: every page ships with its navigation placement (2026-08-26)

**A new page is not complete until its navigation placement is written down and
implemented: which portal, which sidebar group, its position in that group, and
its role visibility.** A page built without a menu entry is unreachable, and a
page added to a portal the person testing it does not work in is invisible to them.

The Rate Con Inbox is the example: it was built, deployed, and reported as live,
but it was only added to the Dispatch portal sidebar. An owner testing from the
Management portal could not see it, so for that role it did not exist until it
was also placed under Management → Dispatch, after Loads, with the same pending
count badge.

### Default placement: Management sidebar order

When a page belongs in Management, placement follows the existing groups in this
order unless there is a reason to deviate:

1. Overview
2. Messages
3. Recruiting
4. Drivers
5. Dispatch
6. Accounting
7. Equipment
8. Safety & Compliance
9. Communications
10. Settings
11. Help

A page added under Dispatch, for example, is inserted after **Loads** unless the
feature naturally belongs before it.

### Owner sees every page

**The owner role sees every page.** Owner is the build and oversight role for
this project. If a page is hidden from owner, that is a defect, not a design
decision. Role visibility narrows access for other roles; it never excludes
owner. When documenting role visibility, state which non-owner roles are
admitted; owner is implicit.

### What to record for each new page

Before marking a page done, confirm and write down:

- **Portal** — e.g., Management, Dispatch, Operator, Staff.
- **Sidebar group** — e.g., Management → Dispatch.
- **Position in group** — e.g., after Loads, before Brokers.
- **Role visibility** — which non-owner roles can see it, and whether access is
  further gated inside the page.
- **Direct route** — the URL, so it can be reached while the sidebar change is
  pending or for support.

A page that is reachable only by direct route is a preview, not a shipped
feature.

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

## Module 3 — Dispatch Board, Pass 1: rename and placement

The page previously labelled "Dispatch Board" is a driver availability calendar
in daily use. It was not replaced. It is now labelled **Driver Status**, and a
new, separate **Dispatch Board** page was added alongside it as a shell — no
queries, no state, no database change in this pass.

### Placement (every-page-ships-with-its-navigation)

- **Portal:** Dispatch and Management.
- **Sidebar group:** Dispatch portal → Operations group; Management → Dispatch.
- **Position:** FIRST in both groups, above Driver Status. This deviates from the
  standing default of "inserted after Loads". Reason: the load-aware board is the
  primary dispatch surface, and both Driver Status and Loads are read from it.
- **Role visibility:** dispatcher and management. Owner sees it, as owner sees
  every page.
- **Direct route:** `/dispatch/board` (Dispatch portal),
  `/management?view=dispatch-board` (Management portal).
- The new board uses the `LayoutGrid` icon; Driver Status keeps `Container`, so
  the two are not confusable in the rail.

### The internal view key stays `dispatch`

Only user-facing strings were renamed. The view key `'dispatch'`, the
`?page=dispatch` query value, and the localStorage keys `dispatch_view` and
`dispatch_status_ribbons_open` are unchanged — renaming them is a large blast
radius for no user benefit. Call sites that depend on that key:

- `ManagementView` union and `ALLOWED_VIEWS` in `ManagementPortal.tsx`
- the three Management overview dispatch-breakdown tile handlers
- `DeactivationPage.tsx` nav (flat legacy nav; the new board is deliberately
  absent from it, since it navigates out to `/management?view=...`)
- `NotificationBell`

### Scope decisions settled for Pass 2

- **A load stays on a driver's chain until its PAPERWORK is complete,** not until
  it is delivered. A delivered load still missing a required document is still
  being worked: the dispatcher is chasing it and the driver is not clear.
- **"Needs work" is NOT "last load delivered."** It is a driver with no load
  booked ahead, regardless of whether a delivered load is still awaiting
  paperwork. The two conditions are independent and a driver can be in both.
- **OPEN, required before Pass 2 can be built:** nothing in the codebase defines
  which documents a load requires. `is_required` exists only on the onboarding
  `documents` catalog; `load_documents` has no required-ness. The predicate has
  to be defined, it must treat an APPROVED document exception as satisfying the
  requirement, and the requirement set varies by load type (loadout owes neither
  BOL nor POD — the guided photo package is the POD). Configurable per the SaaS
  rule, following the `DEFAULT_CHARGE_PAY_CLASSES` precedent. One predicate, one
  reader — not re-derived per consumer.
- **`loads.driver_accepted_at`, `driver_declined_at`, `driver_decline_reason`**
  exist from Module 2 and contradict the operating model, which states there is
  no formal offer-and-accept step and that one should not be built. Decision: the
  columns STAY; no migration removes them. The board must NOT surface them as a
  gate, a status, or a filter.
- **Chain feasibility is an honest time-gap readout** plus the two city/state
  pairs. Only arithmetic-certain cases are flagged (negative or overlapping
  gaps). No drive-time verdict is computed. Evidence: `facilities` has no
  coordinates and `load_stops` lat/long are driver check-in points, not facility
  locations, so distance is not derivable. Do not invent one.

## Module 3 — Dispatch Board, Pass 2: the paperwork predicate

`src/lib/loadPaperwork.ts` is a pure module — no supabase, no React, no
queries. It takes the documents and exceptions the caller already holds and
returns a structured answer. Its first reader is the "Outstanding paperwork"
block at the top of `DocumentsSection` on Load Detail; the Dispatch Board
becomes its second reader in Pass 3. The predicate shipped with a real reader
in the same change, deliberately: a predicate with no caller is the failure
pattern this project has already produced four times.

### Two levels, and why one is not enough

- **required** — the load is not finished until this is satisfied. Holds the
  load on the driver's chain.
- **expected** — should exist, is chased when missing, never blocks.

A BOL is wanted at origin and often never materialises. Requiring it would park
loads on a driver's chain forever; omitting it entirely would mean nobody ever
chases it. Two levels is the smallest shape that handles both.

### Default matrix

| Load type | Requirement | Level |
|---|---|---|
| standard | Proof of delivery (`pod`) | required |
| standard | Bill of lading (`bol`) | expected |
| per_ton | Proof of delivery (`pod`) | required |
| per_ton | Scale ticket (`scale_ticket`) | required |
| per_ton | Bill of lading (`bol`) | expected |
| loadout | Pickup inspection photos (`loadout_pickup_inspection`) | required |
| loadout | Roof check — rear doors open (`loadout_pickup_inspection`, photo label `Rear Doors Open`) | required |
| loadout | Delivery inspection photos (`loadout_delivery_inspection`) | required |

A loadout owes **neither BOL nor POD**. The guided photo package is the POD.

The roof check is a **labelled photo inside the pickup set**, not a document
type of its own — the requirement carries a `photoLabel` and is satisfied only
by a pickup-inspection row whose `photo_label` matches after trimming and
case-folding.

**KNOWN LIMIT.** `photo_label` is free text with suggestions, so the roof-check
requirement matches on the exact string `Rear Doors Open`. A driver who types
something else will not satisfy it. The durable fix is a fixed capture slot in
the driver app (Module 11), not a looser matcher. Fuzzy or partial matching is
deliberately not added here — it would turn a precise miss into a silent
false pass.

### Satisfaction rules

A requirement is satisfied by any of: a `load_documents` row of that type (plus
matching `photo_label` where the requirement carries one); an approved
`document_exceptions` row; or a resolved one. `pending` does not satisfy and is
reported separately as "exception filed, awaiting review"; `denied` does not
satisfy at all.

An **approved exception satisfying the requirement** is what stops a receiver
refusing to sign from parking a driver permanently — the dispatcher accepts
that the document will not arrive, and the load stops being held.

`load_documents.is_verified` does **not** gate completeness. A document that
exists counts. Verification is a separate quality gate, and gating on it would
park every delivered load behind an office click.

The entry point never returns a bare boolean. A caller that can only see
"incomplete" cannot tell a missing POD from an unchased BOL, which is the whole
reason two levels exist.

### Configurability — deliberately deferred

The SaaS rule says business rules are configurable. This pass ships the matrix
as a plain constant with **no override parameter and no policy column**, on the
`DEFAULT_CHARGE_PAY_CLASSES` precedent. An unused override argument is the same
uncalled-code pattern the pass structure exists to avoid. When a second carrier
needs a different matrix, the override path gets built then, against a real
requirement.

### Status is not auto-advanced

`pod_received` already exists as a load status and is advanced by hand. A
document-derived predicate and a hand-typed status will disagree. This pass
adds no writer, trigger, or RPC: a state change with a rule attached gets
exactly one writer, and creating a second one inside a display pass is how that
rule gets broken. Where the two disagree, both are shown and neither is hidden.

**OPEN:** whether completeness should ever drive load status. A later,
deliberate decision, not a side effect of this pass.

### Not in the matrix

Lumper receipts and detention documentation are deliberately absent. Both are
accessorial-dependent and Module 5 does not exist yet. Revisit when it lands.

### Test fixture provenance

`document_exceptions` is not modelled in `src/test/helpers/pgFake.ts`, and
`load_documents` appears only as an empty table with no write path. There is no
real writer to drive, so the reader fixture in
`src/components/dispatch/loadDetail/__tests__/outstandingPaperwork.test.tsx` is
**authored**, not derived from the writer's output. Stated here rather than
left to be assumed.

## Module 3, Pass 3 — the load-aware Dispatch Board

Read-only. No schema changes, no writes, no edge functions, no realtime.

### What shipped

- **`src/lib/dispatchBoard.ts`** — pure chain assembly. Takes flat loads, stops,
  documents, exceptions and drivers; returns per-driver ordered chains plus
  faults. It does not re-implement the paperwork rule: it calls
  `evaluateLoadPaperwork` and is the predicate's second reader, as Pass 2 said
  it would be.
- **`src/pages/dispatch/DispatchBoardPage.tsx`** — replaces the Pass 1 shell.
  Four set-based reads (operators + profiles, loads with stops, load documents,
  document exceptions) behind one React Query key, `['dispatch-board']`, with a
  manual Refresh. No subscription.

### Chain membership

- Pre-delivery statuses (`available`, `covered`, `dispatched`, `in_transit`,
  `at_delivery`) are always on the chain.
- `delivered` and everything after it stays on the chain **only while its
  paperwork is incomplete**. A load leaves the board when its paperwork closes,
  not when its status advances — an invoiced load with no POD is still the
  driver's problem and still visible.
- `cancelled` and `tonu` are never on a chain. A TONU never receives a POD, so
  paperwork could never close it and it would sit on the board forever.

### Ordering

Ascending by resolved delivery time. The resolution is a named three-step
fallback, and the source is carried on every chain entry so a wrong order can be
traced rather than guessed: `last_delivery_stop` → `first_stop` → `created_at`.
Chains are **uncapped**; nothing is sliced. A driver with five booked loads shows
five.

### What the board does not do

No writes and no status mutation. No chain-gap or feasibility arithmetic — the
board shows the queue in delivery order and a dispatcher reads the gap. No
scoping or dispatcher filter. No realtime. No nav badge.

### Faults surfaced

- A chain load still at `available` despite having a driver is shown in place
  with its real status rather than hidden.
- Loads past `available` with **no** driver belong to no chain, so they would
  otherwise be invisible here. They are reported as a single line linking to the
  loads list.
- A load held by a non-dispatchable driver is not dropped. Those drivers appear
  in a separate "Not on dispatch — holds an assigned load" section below the
  main table.

### The cutover line

A driver with no chain reads "No load recorded in SUPERDRIVE", and the page
carries a standing note that drivers dispatched in Alvys appear with no load.
The empty state is a statement about this system's records, not a claim the
driver is idle.

### Realtime channel rule (standing)

Any hook that opens a `postgres_changes` channel must derive a **unique channel
name per mount**. A fixed name crashes with "postgres_changes callbacks after
subscribe()" the moment the component mounts twice — which is exactly what
happened when the rate-con badge rendered in two portals. `badgeNode` consumers
inherit this rule.

### Pass 3a — driving work vs office work on the chain

A flat delivery-ordered chain treated every entry as the same kind of work. A
load that has delivered but is missing its POD carries a delivery date in the
PAST, so it sorted ABOVE the loads the driver is currently running: on the live
board, Johnathan Pratt's row showed a Ready To Invoice load as current with two
In Transit loads listed behind it.

- **A load in transit is DRIVING work** — what the driver is doing now.
- **A delivered load missing its POD is OFFICE work** — what the dispatcher is
  chasing.

Chain **membership is unchanged**. `evaluateLoadPaperwork` still decides what
stays: pre-delivery statuses are always on, delivered-or-beyond stays only while
paperwork is incomplete, `cancelled` and `tonu` never. Only the PRESENTATION
splits, into `current` (first pre-delivery load, ascending), `queued` (the rest,
uncapped) and `paperworkTail` (delivered-incomplete, oldest first — the longest
outstanding is the one worth chasing).

Three derived states replace the previous two:

- `driving` — at least one pre-delivery load.
- `paperwork_only` — no pre-delivery load but a non-empty paperwork tail. The
  driver needs work AND his POD needs chasing; both are true at once and the
  board says so, rendering "No load recorded in SUPERDRIVE" in the current
  position with the tail beneath it.
- `no_chain` — nothing at all.

The delivery-time fallback source is now visible: loads ordered by `first_stop`
or `created_at` carry a small marker beside the date naming the source in plain
words. No marker for `last_delivery_stop`, the normal case.

A coverage line near the cutover note reads "N of M drivers have loads in
SUPERDRIVE" — N being drivers in `driving` or `paperwork_only`, M the
dispatchable drivers rendered. It climbs through cutover, so it is a live
progress signal rather than a static label.

Part E of Pass 3 (seed loads) was correctly skipped: Johnathan Pratt's four
existing loads carry real delivery appointments and proved the ordering without
seeding. The heading below stays in place and empty.

### Board seed loads — purge before cutover

No seed loads were created in this pass. The board was built and tested against
the pure module's fixtures; when demo data is needed it must be created through
the Create Load flow and every load number listed under this heading.

## Module 3, Pass 4 — dispatcher scoping with a saved preference

A dispatcher filter above the Dispatch Board. Read-only: no schema changes, no
edge functions, no writes to loads, `active_dispatch` or `dispatch_daily_log`.

**Default is ALL drivers**, saved per user through `useViewPreferences` with
`viewKey: 'dispatch_board'` (stored in `user_view_preferences.filters` as
`{ dispatcher: 'all' | 'me' | <userId> }`). The choice follows the user across
devices.

**No role-based defaulting, deliberately.** Jack Barney and Yasir Nawaz are
dispatch managers who hold the plain `dispatcher` role while carrying one or two
drivers each and overseeing the fleet. Nothing in the data distinguishes a
manager from a dispatcher, so any role-derived default would drop them onto a
near-empty board. Everyone starts on the whole fleet and chooses for themselves.

**Which dispatcher field — do not mix these.**
- The board filter reads `active_dispatch.assigned_dispatcher`: the PERMANENT
  driver-level assignment. This mirrors the Driver Status page.
- The Loads list "All Dispatchers" filter reads `loads.dispatcher_id`: who
  BOOKED that load. Same words, different data.

**Faults are never hidden by the filter.**
- Main driver list: filtered.
- "Not on dispatch — holds an assigned load": filtered (driver-keyed rows).
- Driverless-loads line: ALWAYS fleet-wide. Those loads have no driver and so no
  dispatcher; there is no honest way to scope the count.
- Coverage line: ALWAYS fleet-wide, reworded to "N of M drivers across the fleet
  have loads in SUPERDRIVE." It is a cutover orientation signal, not a work list.
- When a filter is active the board states it plainly: "Showing X of M drivers —
  assigned to <name>." Absent when the filter is 'all'.
- The Alvys cutover note is unchanged and unfiltered.

**Label consistency.** Driver Status now reads "Assigned to me" / "All drivers",
matching the board. Labels only — values, state key and logic on that page are
untouched.

**`useViewPreferences` now carries filters.** HAZARD, recorded because the hook
is shared: `persist` upserts every managed field together. A consumer that does
not manage filters must not erase them. The hook keeps the live preference in a
single ref (replacing the pairwise setState-callback reads) and carries any
loaded filters through every save, so `LoadsListPage` — untouched in this pass —
continues to save columns and sort without blanking a stored filter.

Filtering itself is a pure exported function, `filterRowsByDispatcher` in
`src/lib/dispatchBoard.ts`, unit-tested without React. It does not reorder rows
or alter any row's `current`, `queued` or `paperworkTail`.

## Module 5, Pass 1 — stop arrival and departure, with provenance (2026-08-27)

**Entry control update (2026-08-27) — explicit Done, no half-entered saves.**
The native `datetime-local` popup offered a Clear and no confirm: you committed
by clicking into empty space, and the click-away happily committed a half-entered
value — a time with the date still `mm/dd/yyyy` — so the field could display a
time that was never recorded. `StopTimePicker` replaces it with a popup holding
separate date and time inputs, a primary **Done** and a quiet **Clear**.
Incomplete (exactly one of date/time filled) is refused on EVERY commit path:
Done is disabled with "Enter both a date and a time.", and click-away DISCARDS
instead of committing, so the two paths cannot disagree about what half-entered
means. Nothing is defaulted — no today, no midnight, no now. Both empty is a
legitimate value and Done commits it as "no value". Escape discards and restores
whatever the field held when the popup opened; that is the cancel path, distinct
from Clear, which actively empties a recorded value.

**The two Clears were made identical rather than renamed.** The Clear inside the
popup and the Clear beside the field now do the same single thing — empty the
field — and the inner one closes the popup after doing it. Renaming one would
have implied a distinction that does not exist; two controls that do the same act
may share a word, two controls that do different acts may not.

Unchanged by this pass: the departure-before-arrival rejection, the provenance
trigger (`stamp_load_stop_time_source` fires on the resulting UPDATE regardless
of which control committed it), and the carrier-timezone conversion — the picker
reads and writes carrier-zone naive strings and never constructs a `Date`, so it
cannot drift to the browser's zone. A round-trip through `isoToNaive`/`naiveToIso`
under `TZ=Asia/Karachi` is pinned in `stopTimePicker.test.tsx`.


`load_stops.actual_arrival_at` / `actual_departure_at`, the coordinate columns,
the dwell rendering in `StopsTimeline`, the delete-protection in `loadEdit.ts`
and the operator-update trigger all predate this pass. What was missing was any
writer at all — a reader and a security policy built for a writer that never
arrived. This pass adds the writer.

**Detention is NEGOTIATED, not computed.** At SUPERTRANSPORT detention is agreed
with the broker and lands as a REVISED RATE CONFIRMATION, which the existing
parse path already handles. Arrival and departure times are evidence for that
conversation, not an input to a formula. Do not build a detention calculator, do
not derive a detention charge from a dwell duration, and do not offer to.

**Capture source is derived by trigger, never accepted from the client.**
`stamp_load_stop_time_source` fires BEFORE UPDATE on `load_stops`. When a time
changes to a non-null value it sets that time's `*_source` from the WRITER'S
ROLE — `driver_app` when the writer holds the operator role, `dispatcher_entry`
otherwise — and stamps `*_recorded_by` with `current_profile_id()`. The client
sends only the two timestamps. An operator therefore cannot claim a stronger
provenance than they have, and the driver check-in in Module 11 needs no extra
work to be recorded correctly. The enum has exactly two values; no ELD value
exists because no ELD writer exists.

**A dispatcher correction re-stamps, deliberately.** Editing a time a driver
recorded moves both source and actor to the dispatcher. The stored value is now
the dispatcher's, and the board must not present a corrected time as if a
driver's phone produced it. Clearing a time to null clears its source and actor
with it. Arrival and departure stamp independently.

**No RLS work is needed for Module 11.** `enforce_load_stops_operator_update`
already permitted an operator to write arrival, departure and the coordinates on
their own stops. Its `allowed` array was NOT modified by this pass and must not
be: the new columns are trigger-written, so granting operators direct access to
them would reopen exactly the hole the trigger closes.

**The dispatcher control writes no coordinates.** A dispatcher typing a time has
no location, and an absent coordinate is honest. Nothing is pre-filled — not the
appointment time, not "now"; a default that looks like a record is worse than an
empty one. A departure earlier than its arrival is rejected with a plain message
rather than silently swapped.

### Baselines and the DB / non-DB gap

Measured 2026-08-27 (reference reclassification pass): **765 passed / 7 skipped
(100 files)** with a database, **736 / 28 (100 files)** without. The no-database
run is measured
with `--maxWorkers=2`, and that flag is recorded here alongside the figures: at
full parallelism the RTL suites contend and time out, and those timeouts are a
harness artefact, not a regression.

The registered-test gap between the two shapes is **8**, measured: 772 registered
with a database against 764 without. It comes from the two `gatedDescribe`

suites, which collapse a whole file to one named placeholder when gated —
`share-token-throttle` (8 → 1) and `rods-live-certification` (2 → 1). Per-test
`gatedIt` files register the same count in both shapes, which is the point of
using it.

The five trigger tests register in BOTH shapes and are skipped in both. The
earlier prediction that they would run once the migration applied was wrong, and
for a reason worth recording: the columns and the trigger are now installed, but
`stamp_load_stop_time_source` is a BEFORE UPDATE trigger and the sandbox psql
role holds SELECT + INSERT and no UPDATE on any public table — the same
deliberate restriction that bars EXECUTE for the certify RPC. Granting UPDATE to
the harness is forbidden, so the file gates on the capability and says so
loudly. These five, and the certify execute arm, belong on a disposable
instance with a real session.

The registered-test gap of **8** is fully accounted for, with nothing left over:
`share-token-throttle` collapses 8 → 1 and `rods-live-certification` 2 → 1 under
`gatedDescribe`. 7 + 1 = 8. No other file contributes.

### What the behavioural gates do and do not cover

Three capability gates guard the five behavioural trigger tests, in order:
`PGHOST` present, the provenance columns installed, and UPDATE on
`public.load_stops`. The third is the one that bites, and it is not an accident
to be fixed: the harness role has SELECT and INSERT by deliberate design and
must not be granted UPDATE.

So the honest coverage statement is:

- **Structural** — the trigger exists, is BEFORE UPDATE on `public.load_stops`,
  is SECURITY DEFINER and pins `search_path` to `public, extensions`. Asserted
  automatically from the catalog on every DB-attached run, under the harness
  role's existing privileges.
- **Dispatcher path behaviour** — verified MANUALLY in the application. No
  automated check covers it here.
- **Operator (`driver_app`) path behaviour** — CANNOT be verified until the
  driver check-in app exists. Nothing writes that path today.

A permanently skipped test is not coverage, and the banner says so at the same
volume as the missing-PGHOST one.

### The INSERT hole, and when it becomes real

The trigger is **BEFORE UPDATE only**. A path that INSERTs a `load_stop` with
`actual_arrival_at` or `actual_departure_at` already populated would leave the
matching `*_source` and `*_recorded_by` NULL — a recorded time with no
provenance.

No such path exists today. Stop replacement on the revision path DELETES and
re-creates stops with no actual times, guarded by `p_ack_stop_data_loss`, and
the dispatcher control writes times by UPDATE. A driver-app upsert or an ELD
import would be exactly such a path. Revisit the trigger — add a BEFORE INSERT
arm — when either arrives; do not add it speculatively before there is a writer
to shape it against.

### Waiting on the driver app — the single list for Module 11

Everything below is real code on a shared path, exercised only by the half of
that path the application can reach today. Module 11 is what makes the other
half real, and is expected to close this list:

- **The `driver_app` branch of `stamp_load_stop_time_source`** — the operator
  path. Nothing writes it today. The dispatcher branch of the same trigger is
  verified end to end in the application, which is the only reason the branch is
  trusted at all.
- **The timezone label on recorded arrival and departure times** — verified via
  the appointment window rendered by the same component with the same helper,
  because no stop in the database has a recorded arrival to render.

### Reference classes go stale, and that is normal

`LABEL_MAP` grows every time a broker's printed label is learned, and every
addition makes the stored rows for that label stale in one step: a row filed
`other` (or `unclassified`) is now classified differently, and the revision diff
keys on class + value. Reported as duplicate reference numbers after a revised
rate confirmation.

The fix is not a one-time backfill:

- `buildRevisionDiff` recognises the same `value_key` arriving under a different
  class as a **reclassification** — one entry, worded so the dispatcher can see
  the number is not changing, only how it is filed. Never an add plus a remove.
- `saveLoadReferences` applies one by UPDATEing the stored row's
  `reference_class` before the upsert runs, so the row id, its citations and its
  `created_at` survive. Writing the new class straight through would miss the
  upsert key `(load_id, reference_class, value_key)` and insert a second row.
- `src/lib/referenceBackfill.ts` plans the historical repair and
  `scripts/reference-backfill.ts` runs it. It imports `classifyReferenceLabel`
  rather than reimplementing the rule in SQL. The trap it exists to avoid: a
  reference with NO printed label is stored with `label = <class name>`, and
  those rows are correctly `other` — an absent label and an unrecognised one are
  different things. The live audit found 0 rows needing reclassification and 0
  sentinel rows, so the script has not had to run.
- No unique constraint on `(load_id, value_key)`: one number can legitimately be
  both the BOL and the PRO.


### Load times are pinned to the carrier timezone

`src/lib/carrierTimezone.ts` holds `CARRIER_TIMEZONE = 'America/Chicago'`. All
load appointment and actual times are **entered, stored and displayed against
it, never the browser's zone**. SUPERTRANSPORT's dispatchers work from Pakistan
on Central-set machines; before this pass correctness depended entirely on that
OS setting on six machines, recorded nowhere. It is now a decision in code.

- Write paths convert with `naiveToIso` (`loadSavePayload.toIso`,
  `stopTimes.fromLocalInputValue`); read-back into `datetime-local` inputs uses
  `isoToNaive` (`stopTimes.toLocalInputValue`, `loadEdit.toLocalInput`).
- Read paths pin `timeZone: CARRIER_TIMEZONE` — `loadDetail.formatDateTime` /
  `formatWindow`, `loadFormat.formatShortDate`, the Dispatch Board date, and the
  previously hardcoded `America/Chicago` strings in `binderShareFormat`,
  `equipmentExport` and `brokerAddressPrefill`, which now import the constant.
- Load Detail shows the zone abbreviation (CDT/CST, resolved per date) beside
  the appointment window and the recorded arrival and departure. The Dispatch
  Board shows dates only and carries no label.
- DST is solved from the instant, not assumed. The spring-forward gap hour
  settles on the pre-transition offset and is documented in the helper.
- The parser is unchanged and still emits **naive local strings exactly as
  printed** on the rate confirmation. That is correct: the document states a
  wall clock, not an instant.
- **No backfill was needed.** Existing values were written under a
  browser-is-Central assumption and are now read under an explicit Central
  assumption — same instants, same meaning.
- Becomes a per-carrier setting at multi-tenancy. Deliberately a constant now:
  no override parameter, no settings row.
- `dispatchBoard` chain ordering now compares parsed instants rather than
  `localeCompare` on ISO strings, which was only correct while every timestamp
  serialised with the same offset form.

### The embed guard now reads every select, in src/ AND in edge functions

`postgrestEmbeds.test.ts` used to skip any `.select()` whose argument was not a
plain string literal, and it never looked at `supabase/functions/` at all. A
guard that walks past what it cannot read reports green while covering nothing;
that is how `operators(first_name)` survived in the app and `operators.email`
survived in an edge function.

- The scan now walks **both roots** (`src/` and `supabase/functions/`) and finds
  950 selects. All 950 resolve; 3152 column references and 166 embed hops are
  checked. **Zero skips.**
- A select argument is RESOLVED, not skipped: string literals, `'a' + 'b'`
  concatenations, module-level (and function-local) `const` strings followed
  across named imports, templates interpolating those consts, and ternaries
  (both branches are checked). The optional second argument
  (`{ count: 'exact', head: true }`) is split off and ignored.
- Anything the resolver still cannot read **fails the test by name**, with the
  file, line and the select text. `UNREADABLE_ALLOWLIST` exists for genuine
  exceptions and is **empty**; every entry added to it is a hole.
- Triage outcome of the 26 previously-skipped non-literal selects: **all 26
  resolved with no source change and no allowlist entry.** 24 were term
  literals paired with a `count` option, one was a `+` concatenation, one a
  `const col` ternary. No hoisting to module-level consts was needed, so none
  was done.
- Rootless `.select(` calls are only considered when a Supabase client or
  `.from(` appears within the preceding 300 characters. This is what keeps
  `textarea.select()` and prose in comments out of the scan.
- `literalOf` rejects a body containing an unescaped closing quote. Without
  that, `'a, load_stops(' + 'x)'` folds into one pseudo-literal and the embed
  stops being recognised as an embed — a silent loss of nesting, which the
  guard caught on itself.

**Defect found and fixed by the widened scan:**
`supabase/functions/send-notification/index.ts:407` selected
`operators.email`, which does not exist. PostgREST rejected the whole request,
so the ICA signing-link audit row recorded `driver_email: null` on every
`ica_sent` event. It read as an absent address rather than a failed query
because the `error` was destructured away. Now reads
`applications(email)` through `application_id`, and logs the error if the
lookup fails. **Requires an explicit deploy of `send-notification`.**

**Harness note — the canvas stub is now wired by a postinstall script.**
`overrides`/`resolutions` in package.json were not honoured on a plain
`bun install`: the real `canvas@2.11.2` came back from the registry with no
native binding, and all 100 test files failed to collect with
`Cannot find module '../build/Release/canvas.node'`. `tools/canvas-stub/link.mjs`
now runs on postinstall and points both `node_modules/canvas` and jsdom's own
hoisted copy at the no-op stub — jsdom resolves canvas from its peer directory,
so the root link alone is not enough. A genuine native build, if one ever
exists, is left untouched.

Baselines after the stop-time picker pass: **775 passed | 7 skipped** with a
database (100 files passed | 1 skipped), **746 passed | 28 skipped** without
(94 | 7; `PGHOST=` and `--maxWorkers=2`). The +9 in each shape is
`stopTimePicker.test.tsx`; the earlier embed-guard pass contributed the +1
`reads every select it finds` test.


## Investigation closure — Issue 2 (permission denied for loads / user_roles / current_profile_id)

Date: 2026-08-27.

Status: **closed as stale — no current emitter.**

The original error report (`permission denied for table loads`, `permission denied for table user_roles`, `permission denied for function current_profile_id`) was traced to work performed on 2026-08-20. The code paths that produced it have since been replaced.

Basis for closure:

- `public.grant_parity_report()` returned **zero rows** for both `loads` and `user_roles`.
- Direct privilege checks confirmed `authenticated` holds `SELECT, INSERT, UPDATE, DELETE` on both tables.
- `has_role()` is callable from an authenticated session.
- The `current_profile_id` revoke from 2026-08-20 is intentional and correct; no invoker paths reach it.

### Standing constraint: postgres logs are not a reliable investigation source

At the time of this check, `postgres_logs` retained roughly **nine minutes** of history (26 rows spanning 18:01–18:10 UTC). "No matching errors in the retained logs" is therefore not evidence of absence; it can only show that nothing broke in the last few minutes. For any reported database error after the fact, the only reliable evidence is a **current-state check against the catalog** (grants, policies, function signatures, RLS) rather than log history.


## Rate con inbox — collapsed duplicates are visible, but never count as work

Date: 2026-08-27. Issue 3.

**The defect.** A duplicate inbound rate con is auto-collapsed by writing
`status = 'dismissed'` with a `dismiss_reason` starting `Duplicate` and
`dismissed_by` left null (no human dismissed it). The inbox fetched those rows
but the render filter kept only `OPEN_STATUSES`, so they were dropped on the
floor: not in the open list, not in Handled unless the toggle was on, and
invisible in the default view. A second copy of a tender simply vanished.

**One predicate, one place.** `src/lib/rateConInbox.ts` is now the only source
of these rules, imported by both the page and the nav badge hook:

- `OPEN_STATUSES` — `received`, `pending_parse`, `parsed`, `needs_manual`.
  `dismissed` is deliberately NOT a member. Adding it would resurrect every
  human-dismissed newsletter.
- `isAutoCollapsedDuplicate(row)` — dismissed, `dismissed_by` null, reason
  matches `/^duplicate/i`. Machine collapse, not a human decision.
- `isDefaultVisible(row)` — open OR auto-collapsed duplicate. Drives the list.
- `countsTowardBadge(row)` — open AND not a duplicate. Drives the badge.

**Badge and list disagree on purpose.** The list is a record: you should be able
to see that the broker sent the tender twice, without opening the Handled
drawer. The badge is a call to action: a duplicate needs nothing done to it, so
counting it would send someone to the inbox to find no work. This divergence is
intentional and asserted in `rateConInboxDuplicates.test.tsx` — an agreement
test would be the wrong test to write here.

**Rendering.** Duplicates render in the open list at 75% opacity with a dashed
border, badged `Duplicate — collapsed`, carrying the reason text and no action
buttons at all — no Create load, no Dismiss, no Retry. They are subtracted from
the Handled list so toggling Show handled does not draw them twice. The
"Inbox zero" empty state is gated on the visible list rather than on open
statuses, so it no longer claims an empty inbox while duplicates are on screen.

Baselines at that pass: **782 passed | 7 skipped** with a database
(101 files passed | 1 skipped), **753 passed | 28 skipped** without
(95 | 7; `PGHOST=` and `--maxWorkers=2`). The +7 in each shape is
`rateConInboxDuplicates.test.tsx`.

## Module 5, Pass 1 — detention CLAIM RECORD (2026-08-27)

Detention at SUPERTRANSPORT is NEGOTIATED, not computed. The driver calls his
dispatcher, the dispatcher emails the broker, and if the chase works the broker
sends a REVISED RATE CONFIRMATION with detention on it. That document is the
authority; the money reaches `load_charges` through the existing parse path.
So this pass ships no calculator: no hours, no free time, no eligible minutes,
no dollar figure anywhere in the feature. Stop arrival and departure are
EVIDENCE the dispatcher pastes into the broker email, never inputs to a formula.

What was missing was the conversation. Nothing knew a claim was open, who
raised it, when the broker was told, or whether it died quietly — which is
where detention is actually lost.

### The record

`detention_claims`, staged additively: load, stop, when the driver reported it
and to whom, when the broker was notified, by whom and by which method, a
status, a free-text resolution note, and `resulting_charge_id`.

`detention_claim_status` includes **'abandoned'**, and it is not optional. Most
claims die without an answer, and a status set that cannot say so would record
them as open forever.

`resulting_charge_id` is set **BY HAND** and is the only link between a claim
and the money it produced. Nothing matches charges to claims automatically: a
revised con carries one detention line and a load may hold several claims, so
a guess would attribute a dispatcher's chase to the wrong claim. It is nullable
and never blocks the 'resolved_revision' transition — a dispatcher holding the
revised con but not yet the charge row must still be able to close the claim.

Actor columns are stamped server-side by `stamp_detention_claim_actor`, a
SECURITY DEFINER trigger with `SET search_path TO 'public', 'extensions'`, using
`current_profile_id()` and never `auth.uid()`. `reported_to`, `notified_by`,
`created_by` and `updated_by` are in `PROFILE_FK_COLUMNS`, so
`actor-stamp-fk.test.ts` covers them statically and the fake enforces the FK.

### Deliberate omissions

- **Operators have NO access in this pass.** Deliberate: the driver-facing view
  of his own claims belongs with the driver app, and a read policy written now
  would be a guess at that surface.
- **No new page**, so no sidebar placement was required — the section lives on
  Load Detail, between Stops and Documents. Recording that here so the
  placement rule is visibly satisfied rather than silently skipped.
- No cross-load detention queue; parked in the wish list.

### Claim age

Days since `driver_reported_at`, shown only for non-terminal claims. Common
industry guidance is to submit within about 48 hours, so age is the staleness
signal — it gates nothing.

### Missing evidence is stated, not blanked

A claim on a stop with no recorded arrival or departure says so plainly and
warns that brokers routinely refuse detention without an on-site record. A
blank there would read as "nothing to worry about".

### Baselines after this pass

Measured, both shapes, including FILE counts — the file gap and the test gap
are separate structural signals:

  with a database (PGHOST set):    800 passed | 7 skipped   (103 files passed | 1 skipped, 104 total)
  without a database (--maxWorkers=2): 771 passed | 28 skipped  (97 files passed | 7 skipped, 104 total)

The +18 tests and +2 files in each shape are `detentionClaims.test.ts` (12),
`detentionSection.test.tsx` (2) and the four new staged-SQL stamping cases in
`actor-stamp-fk.test.ts`. The skip counts are unchanged, which is the point:
no new test was gated.

## Standing rule — a SECURITY DEFINER function needs all three (2026-08-27)

The staged detention-claims draft declared `stamp_detention_claim_actor` as
SECURITY DEFINER with a pinned `search_path`, and omitted the
`REVOKE ALL ON FUNCTION ... FROM PUBLIC` that `stamp_load_stop_time_source`
carries. Nothing in review caught it; `definer-live-catalog.test.ts` did, on
the first run after the migration was applied, reporting
`public.stamp_detention_claim_actor()` as an unexpected anon-executable
function. A follow-up migration added the REVOKE.

The rule, from here on, is that all three travel together in the SAME
migration and none of them is optional:

1. `SECURITY DEFINER`
2. `SET search_path TO 'public', 'extensions'` (pinned, never inherited)
3. `REVOKE ALL ON FUNCTION public.<name>() FROM PUBLIC` (and from `anon` /
   `authenticated` where they were granted by default)

A trigger function is reachable by name as an RPC unless the execute grant is
revoked, so 1 and 2 without 3 hand an anon caller a definer-privileged entry
point. `definer-live-catalog.test.ts` is the backstop, not the review step —
it only runs with a database attached, so a draft that omits the REVOKE can
sit unnoticed until the migration lands.

## Test invocation — `--maxWorkers=2` belongs to BOTH shapes (2026-08-27)

The contention mitigation was recorded against the no-database shape only.
Five failures then appeared in the database shape at full parallelism; at
`--maxWorkers=2` the same shape is clean:

```text
DB attached,  --maxWorkers=2 : Test Files 103 passed | 1 skipped (104)
                                    Tests 800 passed | 7 skipped (807)
no DB,        --maxWorkers=2 : Test Files  97 passed | 7 skipped (104)
                                    Tests 771 passed | 28 skipped (799)
```

So the flag is part of the recorded invocation for both shapes, not an
optimisation for one of them. A run without it may fail on RTL timeouts that
are contention, not regression.

A related trap: `bun run test:guards` is a NINE-FILE subset (86 tests). It is
not a shape. A summary reading `9 passed (9) / 86 passed (86)` with zero skips
is the guards subset, not a suite run, and must never be reported as one.

## Module 5, Pass 2 — detention TERMS on the load (2026-08-27)

**What the rate confirmation said, recorded as said.** Pass 1 recorded the
on-site evidence and the claim; this pass records the terms the broker printed,
so the dispatcher taking the hour-three phone call has the free time, the rate,
the cap, the clock start and the notification requirement in front of them
instead of re-reading a PDF.

Six nullable columns on `loads`
(`detention_free_time_minutes`, `detention_rate_per_hour`, `detention_daily_cap`,
`detention_clock_start` (new enum: `appointment` / `arrival` / `gate_checkin`),
`detention_notification_required`, `detention_terms_note`) plus the new enum.

**NULL means NOT STATED, and no column takes a default.** Two hours of free time
is a widespread convention and it is not a term of any particular contract; a
default would have the system quoting the broker on something the broker never
wrote. The display says "Not stated", never a zero or an assumed value, and when
every field is null the block reads "This rate confirmation states no detention
terms." rather than rendering an empty grid.

`detention_notification_required` is a NULLABLE boolean and is therefore
TRI-STATE — required / not required / not stated — everywhere it appears,
including the Edit Load select. Collapsing "not stated" into `false` would have
silenced the prompt below for exactly the loads where nobody knows the answer.

Terms connect to claims in one place: an open claim with no `broker_notified_at`
on a load whose terms require notification carries an inline warning on the claim
card. It is a prompt, not a block — dispatch may still be mid-conversation — and
it disappears the moment a notification is recorded, or when the requirement is
absent or explicitly not required.

Still true from Pass 1, and unchanged here: **detention is NEGOTIATED, not
computed.** Recording a rate per hour and a free-time window does NOT license a
calculator. Nothing multiplies dwell by rate, nothing shows an "eligible amount",
and the section still shows evidence and terms only.

**Manual entry only in this pass.** Terms are typed through the existing Edit Load
path with the rest of the load; parser extraction from the rate confirmation is
Pass 3. Operators cannot write any of the six columns — the
`enforce_loads_operator_update` allow-list was not widened, and a test asserts it
did not grow.

### Test counts after this pass

  with a database (PGHOST set):        835 passed | 7 skipped  (107 files passed | 1 skipped, 108 total)
  without a database (--maxWorkers=2): 806 passed | 28 skipped (101 files passed | 7 skipped, 108 total)

The +20 tests and +2 files in each shape are `detentionTerms.test.ts` (12),
`detentionTermsRoundTrip.test.ts` (4) and four added cases in the existing
`detentionSection.test.tsx`. Skip counts are unchanged: nothing new is gated.

## Standing limit — the change-history snapshot cannot exceed 50 keys per call (2026-08-27)

`update_load_with_stops` builds its change-history snapshot (`v_old`, and the
`v_new` shape derived from its keys) with `jsonb_build_object`. That function
takes TWO arguments per key against a hard Postgres limit of 100 arguments, so a
single call cannot carry more than **50 keys**.

Pass 2 added six detention columns to the snapshot, taking it to 52 keys — 104
arguments — and every load edit failed with SQLSTATE 54023, *"cannot pass more
than 100 arguments to a function"*. Not only detention edits: the snapshot is
built before any field comparison, so EVERY save of EVERY load raised it.

The snapshot is now split across two `jsonb_build_object` calls concatenated with
`||`. The resulting jsonb is identical. Current occupancy, measured against the
deployed function:

  call 1: 34 keys (68 args) — 16 keys of headroom
  call 2: 18 keys (36 args) — 32 keys of headroom

**Standing limitation — pgFake does not model Postgres argument limits.** The
Pass 2 round-trip tests were green the entire time every load edit was broken,
because the fake executes the RPC shape in TypeScript and has no 100-argument
ceiling. A green pgFake test is evidence the payload is carried; it is NOT
evidence the RPC executes. Any future change that adds keys to this snapshot —
or to any other large `jsonb_build_object` in a plpgsql function — must be
verified with a REAL load edit against the database before it is called done.

Verified for this fix: a real edit of ST26015 through Edit Load in the running
app wrote `detention_free_time_minutes = 120`, `detention_rate_per_hour = 50`,
`detention_notification_required = true` and a terms note, and produced four
`load_change_history` rows, all `is_financial = false`.

## Module 5, Pass 3 — detention terms EXTRACTED from the rate confirmation (2026-08-27)

Pass 2 gave the load six detention columns and a hand-entry path. This pass
fills them from the parse. The model was already reading the detention clause —
`rateConCore.ts` has instructed it to carry detention rate and free time in
`special_instructions` since the first parser pass, and `verbatim.broker_terms`
already transcribes the terms paragraph as printed. Nothing new is read off the
document here. The clause is STRUCTURED, and the prose rules are untouched:
detention text stays in `special_instructions` and in the verbatim blocks. The
duplication is deliberate — prose and structured terms serve different readers.

**Null means not stated, and there are no industry-convention defaults.** Two
hours free is a convention, not an agreement. A rate confirmation silent on
detention means detention was never agreed, and emitting 120 there would
fabricate a term that renders on Load Detail exactly like one the broker signed.
A silent document returns six nulls. This is the rule most likely to erode and
it is the primary test case, not an afterthought.

**`clock_start` is null unless the document names the trigger.** "Detention
after 2 hours" states free time and says nothing about which moment starts the
clock: `free_time_minutes = 120`, `clock_start = null`. The three moments —
appointment, arrival, gate check-in — differ by 30 to 90 minutes, and which
governs is a per-broker term. Nothing infers `appointment` as a default.

**`notification_required` distinguishes false from null.** True only when the
document requires notifying the broker; false only when it says notification is
NOT required, which is rare; otherwise null. Pass 2's prompt — "these terms
require notifying the broker and no notification has been recorded" — fires on
true and must stay silent on null, so collapsing the two would invent an
obligation. The load form carries the tri-state as a string for the same reason.

**Both routes carry the terms, and each has its own test.**

- CREATE: `applyParsedToForm` writes only the fields the parse stated; a silent
  document writes nothing at all.
- REVISION: all six appear in the revision diff as individually acceptable
  entries, alongside `broker_terms_verbatim`. A revised rate confirmation is how
  a detention negotiation concludes, so accepting a new hourly rate is not
  agreement to a shorter free-time window printed beside it. A revised document
  silent on detention produces no rows — silence is never read as removal.

**Source, and disagreement.** The terms block labels each stated value with
where it came from: read from the rate confirmation, from a revised rate
confirmation, entered by hand, or source not recorded. Provenance is derived
from the load's own `load_change_history` trail — no column stores it — and
parse origin is inferred from the presence of `verbatim_verification`, which
only the parse path writes. Where both a structured value and a printed clause
exist they are shown TOGETHER and nothing resolves the conflict: a note reading
"three hours free" beside a field holding 120 minutes is displayed as the
disagreement it is, the same principle already applied to loadout scoring and to
the paperwork predicate versus `pod_received`. Nothing is computed from the
terms — no eligible hours, no dollar estimate, no comparison against recorded
arrival times. Detention remains negotiated.

**Contract version.** `PARSER_BUILD_META.contract` in
`supabase/functions/_shared/rateConCore.ts` and `EXPECTED_PARSER_CONTRACT` in
`src/lib/rateConfirmation.ts` both moved 5 → 6, in the same edit, per the
standing rule. `parse-rate-confirmation` does not auto-deploy and was deployed
explicitly alongside `receive-rate-con-email`, which shares the core.

**Snapshot occupancy unchanged.** This pass adds no columns, so
`update_load_with_stops` still holds 34 keys in call 1 and 18 in call 2.

## Module 11, Pass 1 — the driver home screen becomes today's work (2026-08-28)

The operator home screen was a greeting and four tiles. It never said what the
driver was doing. It now leads with the load he is on, read through the SAME
chain rule the Dispatch Board uses (`src/lib/dispatchBoard.ts` / `assembleBoard`)
rather than a second derivation, so home and the board can never disagree about
which load is current. Read-only: this pass writes nothing against loads.

What the screen holds, in order: current load (next stop, window in carrier
time, origin → destination, broker, status), the driver's estimated pay for
that load, required paperwork still outstanding, how many loads are queued
behind it, delivered loads still owing paperwork, then what onboarding still
needs, then the existing tiles.

**Onboarding and driving are CONCURRENT, and the screen shows both.** Go-live at
SUPERTRANSPORT is triggered by insurance, not by finishing onboarding: a driver
hauls on temporary decals and paper logs for roughly a week while he works his
way to Pleasant Hill for USDOT numbers, logo, ELD and dash cam install. A mode
switch that hid onboarding once he went live would make real, dated obligations
invisible at exactly the moment they matter. `OperatorStillNeeded` is therefore
present whenever anything is open and absent only when nothing is.

**The money shown is the driver's number, never the gross.** `src/lib/driverLoadPay.ts`
returns the driver's share and nothing else — no line haul total, no split
percentage. A percentage against a gross invites arithmetic that will not match
the check, because a settlement also carries detention at 100%, reimbursements,
deductions and the R&M deposit. Reimbursements pay ACTUAL cost and only to the
party who spent it; an unconfirmed driver-funded reimbursement is reported as
incomplete rather than guessed, and with no readable policy the figure is
omitted entirely instead of defaulted.

Two RLS facts surfaced and were fixed rather than worked around:

- A driver cannot `SELECT` another person's `profiles` row, so the operator
  portal's direct read left the dispatcher nameless and the Message button
  unwired. `src/lib/staffContacts.ts` routes through `get_staff_contact_info`,
  the SECURITY DEFINER path built for this. Phone is not exposed by that
  function; messaging is the contact path.
- `pay_policy_assignments` was staff-read only, so a driver's client silently
  fell back to the company default and could quote a policy that is not his.
  An additive operator-self SELECT policy is staged with the draft.

**Operator Preview crash.** Mounting `OperatorPortal` inside `StaffPortal` put a
second `NotificationBell` on the fixed realtime channel `notifications-bell`;
supabase-js returns the cached channel and adding a `postgres_changes` listener
after subscribe throws, white-screening the app. Fixed the same way as
`RateConInboxBadge` in Module 3 Pass 2 — unique channel name per mount — and
`src/components/__tests__/notificationBellChannelIsolation.test.tsx` mounts two
bells against a mock that reproduces the caching and the throw, so a third
recurrence fails a test instead of a screen.

## The anon grant on SECURITY DEFINER functions (2026-08-28)

### Supabase default privileges grant anon at CREATE time

`\ddp` on this database shows, for schema `public`, functions:

```
 postgres        | public | function | postgres=X/postgres +
                                       anon=X/postgres +
                                       authenticated=X/postgres +
                                       service_role=X/postgres
 supabase_admin  | public | function | postgres=X/supabase_admin +
                                       anon=X/supabase_admin +
                                       authenticated=X/supabase_admin +
                                       service_role=X/supabase_admin
```

Every function created in schema `public` by `postgres` — which is every
function any migration in this project has ever created — is born with `anon`,
`authenticated` and `service_role` holding EXECUTE. This is standard Supabase
configuration, not a defect in this project and not something done out of band.
It fires at CREATE time only: no event trigger and no post-creation hook
re-grants afterwards. The event triggers that do exist
(`issue_pg_graphql_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`,
`issue_pg_cron_access`, `issue_pg_net_access`) do not touch these ACLs.

### REVOKE ALL FROM PUBLIC DOES NOT REMOVE THE anon GRANT

PUBLIC is the implicit pseudo-role. `anon` is a real named role holding a real
entry in `proacl`. Revoking from one says nothing about the other.

**Every migration in this project that revoked from PUBLIC and considered the
function locked was mistaken.** The function stayed reachable by
unauthenticated callers, and the migration file read as though it were not.
This is also why `definer-live-catalog.test.ts` exists at all: a migration-file
guard cannot see a grant the file never mentions.

`current_profile_id` is the counter-example and the proof. Its revoke, made
2026-08-20 and reaffirmed in migration `20260824134718`, **named the roles
explicitly**. Live `proacl` today:

```
current_profile_id | {postgres=X/postgres,service_role=X/postgres}
```

No `anon`, no `authenticated`. It held because it named roles. The others did
not because they named PUBLIC.

### STANDING RULE, AMENDED

A new SECURITY DEFINER function requires **all four** in the same migration
that creates it:

1. `SECURITY DEFINER`
2. `SET search_path TO 'public', 'extensions'`
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC`
4. `REVOKE EXECUTE ON FUNCTION ... FROM anon` — **unless anon access is
   intended, in which case the migration must say so in a comment naming the
   public route that needs it**

Item 4 is new. Items 1 through 3 were the rule before today and were not
sufficient.

### The current inventory

49 of 205 SECURITY DEFINER functions in schema `public` carry `anon=X`, plus
161 non-definer functions. A subset of the 49 is deliberate — the token-gated
public paths — and the rest have not been classified. The sweep is its own
future pass, registered in `docs/tms-wish-list.md` under KNOWN DEBT; nothing
was revoked in this pass except `driver_load_pay_estimate`.

Full list of the 49 definer functions carrying `anon=X` as of 2026-08-28,
before the `driver_load_pay_estimate` revoke:

```
_audit_actor_name                      add_pei_staff_note
approve_application_correction         archive_applicant_pei (both overloads)
can_driver_message_staff               cancel_application_correction
check_application_email_taken          consume_application_resume_token
driver_load_pay_estimate               email_queue_dispatch
get_application_by_draft_token         get_application_correction_by_token
get_application_pei_summary            get_equipment_shipping_for_operator
get_ica_review_link                    get_inspection_doc_by_token
get_or_create_short_link               get_pei_request_for_response
get_pei_requests_needing_action        get_share_bundle_meta
get_thread_participants                get_user_roles
has_role                               is_own_rods_operator
is_staff                               is_thread_participant
is_truck_owner_for_operator            is_valid_application_draft_token
list_driver_contacts                   list_my_group_threads
list_staff_auto_assigned_drivers       log_pei_manual_send
log_pei_phone_attempt                  mark_thread_read
move_revisions_to_pending              operator_awaiting_return
operator_return_requested              reject_application_correction
resolve_share_bundle                   resolve_share_token
resolve_short_link                     restore_applicant_pei
save_application_draft                 submit_application_correction
submit_application_draft               submit_pei_response (both overloads)
unacked_go_live_blockers
```

`driver_load_pay_estimate` comes off that list with the revoke staged in
`20260828130500_revoke_anon_driver_load_pay_estimate.sql`.

### pay_policies granted unscoped read to the operator role from creation until 2026-08-28

`pay_policies_read_staff` admitted `operator` alongside management, owner,
dispatcher and onboarding_staff, with no row scope, from the table's creation
in Module 1 Pass 1 until 2026-08-28. Any signed-in driver could read every
company pay policy: every percentage, every company default, and every
driver-specific policy written for someone else. The driver-facing surface only
ever needed one number, so the policy now excludes `operator` and the driver
reads his own estimate through `driver_load_pay_estimate`.
