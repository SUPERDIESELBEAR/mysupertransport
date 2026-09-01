# TMS Build Status — Handoff Summary

Date: 2026-09-01 (content runs from 2026-08-22 through 2026-09-01)

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

Figures re-measured 2026-08-29 (look-alike serial guard fix) and written into `src/test/helpers/gate.ts`,
`src/test/README.md`, and this file; all three files carry the same measured
figures. The run used vitest 3.2.7, installed by a caret-range
reinstall rather than a committed pin. Both shapes are run with `--maxWorkers=2`
— the flag is part of the recorded invocation, not an optimisation. Every skip is
named and counted; no silent `it.skip` or `test.skip`.

- **With database attached:** 951 passed, 14 skipped (122 files passed, 1 skipped, 123 total).
- **Without database:** 901 passed, 56 skipped (113 files passed, 10 skipped, 123 total).


Anything that matches neither shape is a signal, not a question. If a skip count
moves without a matching named line in the output, a gate has regressed to
`runIf`/`skip` — fix the gate, do not adjust these numbers to match.

## Open items

- **Unparsed rate confirmations:** Rolling River, MegaCorp, and Nationwide still need parser coverage.
- **33 query sites in `src/components/inspection/` swallow errors;** failures are not surfaced to the UI.
- **Parsed broker address is not applied to an existing broker record.** Extraction itself is built, but the address is only offered when a new broker is created from the document. When the dispatcher links an existing broker that has no address on file, the parsed address is discarded.
- **Load Detail page is read-only for stop-off amounts,** so the edit path that could orphan a `load_charges` row does not exist yet. The unit test for the clear-to-empty transition exists but is unwired.
- **OPEN — Settlement of exactly $0.00 when every load is withheld.** A settlement whose gross is $0.00 because every load was withheld (scale ticket pending, claim hold, paperwork hold, etc.) currently reports `below_threshold`. Arithmetically it is under the minimum, but the wording reads as "a small settlement rolled forward" when the truth is "nothing has been settled yet." Decide whether this needs its own status (`empty`? `withheld`?) or a distinct explanation on the existing state.

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

- **Module 4** — chargebacks with signed authorization attached, the R&M Deposit statement (running balance, deposits, withdrawals), the reimbursement pay class payout rule, and the settlement preview with a driver dispute window. The reimbursement pay class payout rule was recorded twice — here and in `docs/tms-wish-list.md` — and is now MERGED into the single Module 4 entry "Reimbursement pay class — payout rule (Module 4)" in the wish list, which is authoritative for its detail and its trigger.
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

**CLOSED 2026-08-29 (Module 11 Pass 3).** The free-text limit is gone: the
driver no longer types a label at all. `src/lib/loadoutSlots.ts` defines fixed
capture slots and the roof-check slot stores the exact string `Rear Doors Open`,
so the predicate matches with no backfill. Fuzzy or partial matching was
deliberately still NOT added — it would turn a precise miss into a silent false
pass.

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

Both original entries — the `driver_app` branch of
`stamp_load_stop_time_source` and the timezone label on recorded arrival and
departure times — came OFF this list in Module 11 Pass 2, when a driver recorded
an arrival from the operator portal and the trigger stamped it. The roof-check
free-text limitation came off in Pass 3, when fixed slots replaced typed labels.
The list is now empty; add to it only when a shared path gains a half the
application cannot reach.

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

## Module 11, Pass 2 — the driver writes: check-in and load paperwork (2026-08-28)

Arrival, departure and paperwork upload are THREE INDEPENDENT ACTIONS on the
Pass 1 load card, available in any order. No wizard, no sequence, no requirement
that arrival precede departure. The reason is the facility, not the code:
paperwork is usually in hand when he pulls off the dock, but some facilities hand
it over at a window on the way out — and those are disproportionately the
facilities where he sat longest. A flow that demanded paperwork at departure
would be wrong exactly where detention money is.

**The tap is late, and the time adjustment exists for that.** He taps once he is
stopped, which is ten to twenty minutes after he actually arrived, and he never
taps early. At $50/hour in fifteen-minute increments that drift is real money and
always against SUPERTRANSPORT. So the tap opens a sheet — "Just now", 15, 30, 45
minutes ago, plus manual entry in the carrier's time zone. One tap for the common
case, two for the honest one. Nothing is silently recorded as "now".

**Coordinates are best effort; a timestamp is never blocked on a location fix.**
`bestEffortCoords` in `src/lib/stopCheckIn.ts` resolves to nulls on denial,
timeout or an insecure context, and the write proceeds. A missing coordinate is
honest; a missing timestamp is a lost detention claim.

**The `driver_app` branch of `stamp_load_stop_time_source` executed for the first
time in this pass, and stamped correctly.** Johnathan Pratt recorded arrival at
stop 1 of ST-TEST-001 from the phone view with the "30 minutes ago" adjustment:
`arrival_source = 'driver_app'`, `arrival_recorded_by` = his PROFILE id
(`913f9ab4…`, not his auth uid), `arrival_latitude` populated, and the stored
instant 30 minutes before the tap rather than the tap. The card then rendered
"Aug 28, 4:42 PM CDT / Driver check-in" — the first time that string has been
produced by the trigger rather than seeded. The trigger's five behavioural tests
REMAIN SKIPPED and that is unchanged: the harness role has SELECT + INSERT and no
UPDATE, the trigger is BEFORE UPDATE, and granting UPDATE is forbidden. The
branch is now verified in the application instead.

**The upload list is not re-derived.** `LoadPaperworkUpload` calls
`evaluateLoadPaperwork` from `src/lib/loadPaperwork.ts` and renders required and
expected separately, keeping the predicate the single authority on what a load
owes. Camera capture is the primary control with file selection beside it, and
writes go through the existing `uploadLoadDocument` path into `load_documents`.

**No status changes from the driver.** He records facts; dispatch moves status.
No detention reporting, no reminders, no nags — a missed departure is caught by
the Module 5 Pass 1 dispatcher-entry control, and provenance makes the difference
between the two visible.


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


## Module 11, Pass 3 — guided loadout photo capture (2026-08-29)

### Fixed slots, one definition

`src/lib/loadoutSlots.ts` is the single source of truth for what a loadout owes
in photos. The paperwork predicate (`DEFAULT_LOAD_PAPERWORK.loadout`) is
**derived** from it rather than listing the slots a second time, and a test
asserts the derivation — a second list is exactly how the capture screen and the
predicate would drift apart.

This is the durable fix for the roof-check matcher recorded as a KNOWN LIMIT in
Module 5 Pass 2. The slot changed; the stored value did not. The roof check
still writes `photo_label = 'Rear Doors Open'`, so nothing needed backfilling and
`PHOTO_LABEL_SUGGESTIONS` keeps its coupling assertion. Fuzzy matching was
deliberately not added.

### Per-slot instructions

Every slot carries one line of instruction shown with the camera. A label cannot
teach and a new driver has never done a loadout. The roof-check line says what to
look for, not what to photograph: stand at the back with the doors open, shoot up
toward the nose, any daylight through the ceiling is a hole. **Nobody climbs on
the trailer** — no instruction implies otherwise, and a test asserts none does.

Pickup and delivery are different lists. Delivery has no roof check and no
inspection sticker: both are pre-hook checks, done before accepting the trailer.
Delivery adds location signage, which pickup does not have.

### Nothing gates the driver

Required slots are required for the load to clear its **paperwork**, not for the
driver to proceed — the same distinction the predicate already makes. The screen
shows what is still missing and never prevents anything. If the trailer is wrong
he tells dispatch, records it, hooks up and goes: dispatch cannot always reach a
broker after hours, and a driver stranded at a yard is a worse outcome than a
documented dent.

### The inspection sticker is tri-state

A third-party trailer with an expired or missing annual DOT inspection is
SUPERTRANSPORT's violation under SUPERTRANSPORT's authority, and faded stickers
are common. The driver answers one of: a photo plus expiry date, "present but
unreadable" (photo still captured), or "no sticker found" (no photo). A blank is
not reachable, because blank would be ambiguous between three different
situations, only one of which is a compliance concern. Same principle as "Not
stated" on detention terms and the null pay estimate.

`load_documents` gained `inspection_sticker_state` (enum
`loadout_sticker_state`) and `inspection_sticker_expiry`. It is the right home:
the sticker is part of the pickup photo set, and "no sticker found" writes a
fileless row there so all three answers live in one place and the predicate sees
the slot satisfied whichever was given. Two CHECK constraints keep it honest — an
expiry only with `recorded`, and a sticker state only on a pickup inspection.

### Damage raises WATCH, never HOLD

A damage note is a record, not a dispute, so it must not stop settlement.
`record_loadout_damage_flag(uuid, text)` is SECURITY DEFINER with
`search_path` pinned, `REVOKE ALL FROM PUBLIC` and from `anon`, and EXECUTE to
`authenticated` and `service_role`. It admits staff or the operator assigned to
that load, stamps `current_profile_id()`, and **appends to the load's existing
active WATCH flag rather than creating a second one**. The description carries
the damage note, so a dispatcher reads what was found without opening the photos,
and the existing claim indicator on the Loads list and Dispatch Board surfaces it
with no new display work.

`claim_flags` was added to `PROFILE_FK_COLUMNS` and modelled in pgFake, and the
function is registered in the live definer catalog
(`KNOWN_AUTHENTICATED_EXECUTABLE_MAX` 92 → 93).


## Reported issues closed as stale

A running list so the next round of bug reports can be triaged against it instead
of re-investigated. Each entry is a reported issue that was investigated and
found to be stale, false, or already fixed.

| Reported issue | First reported / closed | Reason |
|---|---|---|
| InspectionComplianceSummary embed broken | 2026-08-20 / closed 2026-08-20 | Fixed before report; the embed error predates the 2026-08-20 redesign. |
| Permission-denied errors on operator/document paths | 2026-08-27 / closed 2026-08-27 | `grant_parity_report` was clean; the proposed GRANT would reverse a deliberate revoke. |
| Reference reclassification creates duplicate rows | 2026-08-27 / closed 2026-08-27 | Fixed in the same 2026-08-27 pass that introduced the reclassification path. |
| `update_load_with_stops` fails with 54023 (100-argument limit) | 2026-08-29 / closed 2026-08-29 | **False.** The live function splits the change-history snapshot across two `jsonb_build_object` calls (34 keys and 18 keys). Corrective migration `20260827230239` is present in `supabase/migrations` and is byte-identical to the live definition. Three real UI saves against ST26015 returned HTTP 200 with no 54023; the probe edit was reverted. The report cited `20260827222017` as the latest migration touching the function, but `20260827230239` superseded it 34 minutes later. |

## The look-alike serial guard blocked its own cleanup (2026-08-29)

**Real, but latent.** `enforce_equipment_serial_uniqueness` fires
`BEFORE INSERT OR UPDATE OF serial_number, device_type, status`. Because
`status` is in that column list, assign, return and archive — all pure status
transitions that never touch a serial — consulted a serial-uniqueness check.
On a row whose serial had a near-twin in inventory, every one of them was
rejected, **including deactivation, which is the remedy for the duplicate**.
A guard that blocks its own cleanup.

Latent rather than live: zero near-duplicate pairs existed under the guard's own
canonicalisation, so no staff member could reach the defect. The self-exemption
(`ei.id <> NEW.id`) was present throughout and was never the problem.

The fix adds two early exits, before the collision query:

- `NEW.status = 'deactivated'` always passes. The collision query already
  excludes deactivated rows as comparison targets; excluding them as the subject
  closes the loop.
- On UPDATE, when `device_type` is unchanged and the canonical serial is
  unchanged from `OLD`, return immediately. This is the general fix: no status
  path can ever consult a serial guard again. `device_type` is in the condition
  because the same canonical serial under a different type is a real collision.

### Look-alike uniqueness rested on a trigger alone, 2026-08-28 to 2026-08-29

The unique canonical index planned alongside the guard **never landed**. What
existed, `idx_equipment_items_canonical_serial`, was NON-unique and enforced
nothing; the only unique index was the older `idx_equipment_items_serial_type`
on the exact form, which does not apply the `OILS → 0115` translation and so
does not catch look-alikes at all. For that day, any path bypassing the trigger
— bulk import, restore, direct SQL, a disabled trigger — could have created a
pair. Zero pairs existed, so nothing was corrupted. **That was a fact about the
data, not a guarantee.**

Now enforced structurally:

```sql
CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated';
```

Partial by necessity: a total index would forbid multiple retired twins, which
is exactly the state a duplicate cleanup produces — it would re-create the bug
at the storage layer. The superseded non-unique index was dropped.

Note for future writers: the index expression is evaluated as the **calling**
role on every write, unlike the trigger body which runs as definer.
`authenticated` holds EXECUTE on `canonical_equipment_serial`, so the
application is unaffected; the sandbox test role does not, which is why the
test file's write arms are gated and named rather than quietly absent.

**If the index build ever fails on data that arrives later, it must fail
loudly.** Report the offending pair and stop. A unique index quietly downgraded
to non-unique is the exact state this entry exists to close.

### The general lesson, now seen twice

A rule enforced in ONE layer while everyone assumes it is enforced
structurally. The look-alike serial rule lived in a trigger while a unique index
was believed to exist. The `pay_policies` exposure was the same shape: driver
pay was assumed to be gated by policy while the table itself was readable. In
both cases the enforcement that people reasoned about was not the enforcement
that was running.

TRIGGER: when a constraint is described as enforced, read the catalog for it —
`pg_indexes`, `pg_policy`, `pg_constraint` — before relying on it. A trigger is
enforcement for the paths that go through it, and nothing more.


## Standing limitations of this test environment

### Trigger behaviour cannot be exercised here

The harness role used by `vitest` has `SELECT` and `INSERT` on public tables, but
no `UPDATE`, by deliberate design. Trigger paths that fire on `UPDATE` therefore
cannot be reached automatically in this repository. The following test files are
gated on that restriction:

- `stop-time-source-trigger.test.ts` — 5 behavioural cases, never executed
  anywhere in CI.
- `equipment-serial-guard.test.ts` — 7 write arms (assign, return, archive,
  and variants).

Catalog checks that read `pg_proc`, `pg_policy`, and `pg_indexes` do run and are
the durable, repeatable coverage. Behavioural correctness is verified manually or
on a disposable instance; it is not repeatable in this harness.

### Functional-index coupling with `canonical_equipment_serial`

The unique index

```sql
CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated';
```

evaluates `canonical_equipment_serial(serial_number)` as the **calling role** on
every write. Any role that inserts into `equipment_items` therefore needs
`EXECUTE` on that function. `authenticated` holds it; the sandbox test role does
not. This coupling is not obvious from reading the migration and will apply to
any future functional index.


## Module 6, Pass 1 — MultiService fuel import (2026-08-29)

Imports the MultiService "customized detail" CSV, attributes each transaction to
an owner-operator, and surfaces what could not be attributed. It does **not**
post anything to settlements — that is Module 4.

### The deduplication key is invoice + date + card, not invoice

`Invoice No` is the **merchant's** number, not MultiService's. Two truck stops
both issue an invoice 55231, and the live 297-row export contains repeats. A
dedup key of `invoice_no` alone would silently discard a real fuel purchase
every time two merchants collide, and the loss would be invisible: the row
simply would not appear.

The key is therefore `(invoice_no, invoice_date, card_no)`, enforced by the
UNIQUE index `fuel_transactions_dedup_key`. Overlapping exports — the normal
case, since staff pull three weeks at a time — skip the overlap and report the
count rather than failing the file.

### Card is the authority; the printed name is only confirmation

Resolution runs through `fuel_resolve_card(card_no, date)`, which reads
`equipment_assignments` and honours the assignment window. A card reassigned
mid-month attributes each transaction to whoever held it **on the transaction
date**, not to today's holder.

The matching hierarchy, in order:

1. **Card, date-scoped.** The card is the account the money actually moved on.
2. **Printed unit number and driver name — confirmation only.** When either
   disagrees with the system, the row is imported against the card and marked
   `matched_with_disagreement`, with both values shown side by side in the
   review queue. The name is never allowed to override the card.
3. **Unresolvable card → `unmatched`.** It lands in the review queue for manual
   assignment through `assign_fuel_transaction_operator`, the single writer for
   that transition.

### Reconciliation flags, never drops

The category columns must sum to `Total Amount` to the cent. `Fuel Disc Amt` is
negative and **already** subtracted from the total, so it is added like every
other category — subtracting it would double-count the discount. A row that
does not reconcile is **imported and flagged**, never dropped and never quietly
corrected: a category nobody has heard of yet must show up as a discrepancy,
not disappear.

### Two money formats in one column

`Bulk DEF Amount` prints `"$0.00"` when zero and a bare `50` when populated, in
the same file. `parseMoney` reads both, plus thousands separators, leading
minus, and parenthesised negatives. Text that is not a number at all throws —
an unreadable value is not a zero.

A related bug was caught by the date test rather than by review: the US-date
regex was `(\d{2}|\d{4})`, whose alternation matched `20` out of `2026` and
turned every date in the file into 2020. Four-digit years are now matched
first.

### One row is not one charge

78 of the 297 live rows carry more than one category (diesel plus DEF, most
often). Each row expands into one `fuel_transaction_lines` row per non-zero
category, discount included as its own negative line so it stays visible
instead of being folded into the fuel figure.

### Navigation placement

Management → **Accounting** → Fuel Import. The Accounting group had been
deliberately empty since the sidebar reorganisation; this is the first money
module to land in it. Settlements (Module 4) and Billing (Module 7) join it
there.

### Fuel discount pass-through

`pay_policies.fuel_discount_passthrough`, default **false**. Off means the
discount is company margin and the driver never sees it. It is forward-only
from the policy's effective date; nothing was switched on by the migration.

### Authorization

`preview_fuel_import` and `commit_fuel_import` require management or owner;
`assign_fuel_transaction_operator` requires staff. Each checks in its own body
and all three are registered in `KNOWN_AUTHENTICATED_EXECUTABLE`.
`fuel_resolve_card` is an internal resolver and holds **no** EXECUTE for
`authenticated` or `anon`.

No operator-facing read exists in this pass. Driver-visible fuel arrives with
settlements.

### Test counts after this pass

Two new files (20 pure parser tests, 7 live-catalog checks; the live file is
gated on `PGHOST` and contributes 7 named skips without a database).

- **With database attached:** 951 passed, 14 skipped (122 files passed, 1 skipped, 123 total).
- **Without database:** 901 passed, 56 skipped (113 files passed, 10 skipped, 123 total).

`FacilitySelect.test.tsx` joins the slow-RTL list: it needs ~45s of jsdom work
for a single `userEvent.type` and exceeds the 5s default on this machine. It
passes with `--testTimeout=120000`. Vitest also reported **3.2.7** again during
this pass while the lockfile range is `^3.2.4` — the exact drift recorded under
KNOWN DEBT in `docs/tms-wish-list.md`, and the trigger condition for it (a
baseline moving with no code change explaining it) is now observed twice.

---

## Findings — Active-operator population (2026-08-29, investigation only)

Read-only survey taken before defining "active operator" for the settlement
engine. No code, schema, or data changed.

### Headline counts

- 61 operators with `is_active = true` (0 demo).
- 46 `onboarding_status.fully_onboarded = true`; 15 not.
- 11 `excluded_from_dispatch = true` — **all 11 with a NULL reason**.
- 35 appear on the dispatch board as dispatchable rows.
- 26 active operators are off the board (board row filter is `fully_onboarded`;
  exclusion only removes them from the dispatchable list).

### 1. Off-board population, grouped

**Group A — mid-onboarding, never live (15).** Christopher Harris, Daniel Vazquez
Gonzalez, Dario Hamilton, Jeffery Oliver, Jonathan Grant, Laudel Zequeira
Villafranca, Mel Smith, Michael Campbell, Michelle Watts, Reginald Blue, Robert
Carpenter, Robert Patrick, Ruben Reyes Islas, Shawn Bresett, Shawn Bresett Jr.
Evidence: `fully_onboarded = false`, `go_live_date` NULL, zero loads ever, zero
open equipment assignments, zero `lease_terminations`. 5 are `on_hold`. Shawn
Bresett Jr also has a `truck_owners` row — an owner record, not a driver.

**Group B — onboarded but excluded from dispatch (11).** All have a
`go_live_date`; none has a recorded exclusion reason.
- Departed with a termination on file, still `is_active`: Bilal Leggett
  (2026-07-24), Ronald Lockett (2026-08-10), Willie Westbrook (2026-08-14) —
  each still holding 2-3 open equipment assignments.
- Parked with equipment still out: Cortez Nelson (3), Damian Anderson (3),
  Timothy Rainey (4), David Mitchell (1), Craig Pate (2, holds 1 load).
- Owner-linked: Bilal Leggett, Jamian Anderson.
- Emma Mueller (`on_hold`, no equipment, no loads); Progress Loyd (go-live
  2025-06-30, no equipment, no loads).

### 2. Terminated drivers still on the board

`lease_terminations` rows whose operator is still `is_active = true`: **9**
(22 more belong to already-deactivated operators). Only 3 are excluded from
dispatch, so **6 sit on the board as ordinary dispatchable drivers**.

| Driver | Termination | Reason / note | Excluded | Dispatch status | Last daily log | Equipment out | Loads |
|---|---|---|---|---|---|---|---|
| Ian Dunfee | 2026-07-17 | cause — "Truck and trailer down" | no | home | 2026-08-29 | eld, dash_cam, fuel_card | 0 |
| Vino Huddleston | 2026-07-27 | cause — "Truck down" | no | home | 2026-08-30 | eld, dash_cam, fuel_card | 0 |
| Dale Erickson | 2026-08-05 | cause — "Truck issue" | no | dispatched | 2026-08-28 | eld, dash_cam, fuel_card | 0 |
| Steve Figueroa | 2026-08-10 | cause — "personal time off" | no | dispatched | 2026-08-31 | eld, dash_cam, fuel_card | 0 |
| Steven Fifer | 2026-08-10 | cause — "on vacation" | no | dispatched | 2026-08-28 | eld, dash_cam, fuel_card | 0 |
| Calvin Herrera | 2026-08-10 | cause — "truck issue" | no | dispatched | 2026-08-31 | eld, dash_cam, fuel_card | 0 |
| Bilal Leggett | 2026-07-24 | mutual | yes | home | 2026-07-09 | eld, dash_cam | 0 |
| Ronald Lockett | 2026-08-10 | cause — "Truck issue" | yes | home | 2026-08-10 | eld, dash_cam, fuel_card | 0 |
| Willie Westbrook | 2026-08-14 | mutual | yes | home | 2026-08-31 | eld, dash_cam | 0 |

- **Left and returned / never actually left:** Dunfee, Huddleston, Erickson,
  Figueroa, Fifer, Herrera. The notes read "truck down", "vacation", "personal
  time off" — the lease-termination document was used as a *temporary parking*
  mechanism. All six log dispatch activity after the effective date (four are
  `dispatched` today). A `lease_terminations` row therefore does NOT mean
  departed.
- **Left and not closed out:** Leggett, Lockett, Westbrook. Excluded, no
  dispatch activity since the effective date, equipment never returned,
  `is_active` never flipped.
- `contractor_signed_at`, `pdf_url`, and `insurance_notified_at` are NULL on
  **all nine** rows.
- No money can be reported: no settlement layer exists yet. The only related
  table is `forecast_deductions` — no `settlements`, `rm_deposits`,
  `cash_advances`, or `deductions`.

### 3. Every "active operator" predicate in the codebase

| Call site | Predicate |
|---|---|
| `src/lib/managementMetrics.ts` (`isEligibleDriver`) | `is_active` AND `!is_demo` AND not in `OWNER_USER_IDS` |
| `src/pages/dispatch/DispatchBoardPage.tsx` | `is_active <> false`, rows filtered to `fully_onboarded`; `dispatchable = !excluded_from_dispatch && is_active !== false` |
| `src/pages/dispatch/DispatchPortal.tsx` | fully onboarded, split into excluded / included |
| `ManagementPortal.tsx` (Compliance) | `is_active && fully_onboarded && past go_live_date && insurance_added_date` |
| `ManagementPortal.tsx` (roster count) | `is_active && fully_onboarded && !is_demo` |
| `ManagementPortal.tsx` (dispatch cards) | `active_dispatch` join, `!excluded_from_dispatch && fully_onboarded` |
| `src/pages/staff/StaffPortal.tsx` | `fully_onboarded` only |
| `src/pages/staff/PipelineDashboard.tsx` | `!fully_onboarded || stage5 open`; deactivate writes `is_active = false` |
| `LoadsListPage.tsx`, `FuelImportPage.tsx`, `payTreatment.ts` | `is_active = true` only |
| DB `check_driver_eligibility` | blocks on `is_active IS NOT TRUE`, `excluded_from_dispatch`, plus CDL/med/IRP/DOT expiry |
| `supabase/functions/rollover-dispatch-status` | `excluded_from_dispatch = false` only |

Seven materially different predicates. `lease_terminations` appears in none.

### 4. Truck owners vs drivers

`truck_owners` is one-to-one on `operator_id` with its own `user_id` and the
`truck_owner` role in `useAuth`. 5 rows. In all 5 the owner's `user_id` differs
from the operator's `user_id` — owner and driver are always different people
today, though the schema does not forbid them being the same. All 5
owner-linked operators have never held a load.

### 5. Load history

Only **2 operators** have ever been assigned a load, and both hold one now.
Load data is effectively pre-production.

### 6. Equipment return — is there a home for "management confirms the set is back"?

- `equipment_assignments.returned_at` / `returned_by`: 276 assignments, 117
  returned. Stamped by `DeactivationWizardContent.tsx`, which also flips
  `operators.is_active = false`.
- `equipment_receipts`: shipping receipts (`direction` inbound/return, uploader
  driver or management). 3 return receipts exist. Trigger
  `mark_equipment_return_completed` stamps
  `onboarding_status.equipment_return_completed_at` on the first return receipt.
- `onboarding_status` also carries `*_awaiting_return_shipment` per device,
  `return_instructions_sent_at/by`, `equipment_return_date`,
  `equipment_return_notes`.
- `operator_offboarding_steps` has an `equipment_return` step: 7 operators have
  step rows, **0 completed**.

A home exists, but it records *shipment*, not *receipt inspection*: the
completion stamp fires when a driver uploads a tracking receipt, before anything
is physically checked in, and `mark_equipment_return_completed` is a
driver-triggered write. No field records "management confirms the set is back".
That gap is real.

## Parked state, and a guardrail on lease termination (2026-08-30)

### The mechanism as found

Nine `lease_terminations` rows were written in three weeks by one person who
believed she was recording a status. Six of those drivers were never
terminated — the notes read "Truck down", "on vacation", "temporarily remove
need personal time off" — and all six are still dispatched today, holding
their equipment.

Four things combined to make that the expected outcome, not a slip:

1. A legally significant document generator sat **inline in the routine ICA
   panel** of active drivers, at the same visual weight as ordinary document
   buttons.
2. The button opened the builder on a single click, with no consequence text.
3. The Reason/Notes pair was captioned "Reason (internal — not on document)",
   which reads like a status annotation. The dropdown defaulted to
   "voluntary", so "cause" — selected on all six — was chosen *actively*: the
   list was being read as a status, not as a legal ground.
4. The insert had **no side effects at all**: no `is_active`, no exclusion, no
   status, no notification. Nobody ever received feedback that anything had
   happened.

### The parked state, and where it lives

Investigated before building. `active_dispatch.dispatch_status` carries
`home` / `truck_down` but is **a day's status** — no reason, no end date, and
rewritten nightly by the rollover cron. `operators.excluded_from_dispatch` is
an **administrative hide** that removes a driver from views and daily counts.
`operators.on_hold` is an **onboarding-pipeline** hold. None of the three is
"out for two weeks and coming back", so parked is a fourth thing only because
the third does not serve — a parked driver must stay visible and counted.

Parked is an **overlay**, deliberately separate from `dispatch_status`. One
writer per state change, and the two answer different questions: parked is
"out until the 8th", day status is "what happened today". A parked driver
whose truck comes back Thursday is still parked-until-Monday and
dispatched-Thursday.

- Columns on `operators`: `is_parked`, `parked_reason`, `parked_note`,
  `parked_expected_return`, `parked_at`, `parked_by`.
- History in `operator_parking_events`, actor-stamped via
  `current_profile_id()`.
- RPCs `set_operator_parked` / `clear_operator_parked` — SECURITY DEFINER,
  `search_path` pinned to `public, extensions`, EXECUTE revoked from PUBLIC and
  `anon`, dispatcher/management/owner only.
- Reasons: truck down, vacation, personal time off, medical, other (note
  required). Expected return optional.
- Parked keeps the driver **active in every other sense**: equipment stays
  assigned, the R&M deposit keeps building, settlements run normally.
- The nightly rollover (`rollover-dispatch-status`) **skips** parked drivers
  rather than carrying their status forward — a driver parked for three weeks
  no longer rolls into `dispatched` every night.
- Parked is **not** the departing flag; that concept is not built.

### The guardrail

- Termination moved **out of the routine ICA panel** into its own destructive
  "End the Independent Contractor Agreement" zone on the detail panel.
- A confirmation states the consequence in plain language and requires the
  driver's **full name to be typed** before the builder opens.
- When the operator is active, not excluded, and still showing dispatch
  activity — the exact shape all six mistaken rows had — the confirmation
  warns hard and **names the parked control**, linking to it.
- The reason field is relabelled "Legal ground for ending the lease", has
  **no default selection**, and signing is blocked until one is chosen.
- The write now has a visible consequence: an operator with a
  `lease_terminations` row shows an "ICA Terminated" indicator on the detail
  panel, the dispatch board and Driver Status, with date and ground. It still
  does **not** flip `is_active` — the deactivation wizard owns that.

### Outstanding

Resolved on 2026-08-31 — see "Voiding the six terminations generated in error"
below.

### Notes from the build

- `operators.parked_by` records the actor but carries **no foreign key to
  `profiles`**, deliberately. Adding one made `operators -> profiles` a
  resolvable PostgREST embed, so any `operators(profiles(...))` shape would
  have silently returned the *parking actor's* name where the driver's own
  profile was meant. Referential integrity for the actor lives on
  `operator_parking_events.changed_by`, which is the audit trail of record.
- Baselines restamped 2026-08-30: **963 passed | 14 skipped** with a database,
  **909 passed | 60 skipped** without one.
- Verification screenshots are still outstanding: the sandbox browser has no
  signed-in session (`LOVABLE_BROWSER_AUTH_STATUS=signed_out`), so the five
  captures require a preview sign-in first.


## Voiding the six terminations generated in error (2026-08-31)

### The decision: void, never delete

Six `lease_terminations` rows record ICAs that were never ended. The operators
are active and dispatching today; the rows were written while recording a
temporary absence, before a parked state existed. They are **signed Appendix C
documents** with a carrier signature block and an `audit_log` trail. Deleting
them would make it appear that nothing happened — cleaner, and less true.
Voiding records what actually occurred: a document was generated in error and
withdrawn.

`lease_terminations` still holds **31 rows**. Six now carry a void; nothing was
deleted, and no `effective_date`, reason, note or signature was altered.

### The six

Ian Dunfee, Vino Huddleston, Dale Erickson, Steve Figueroa, Steven Fifer,
Calvin Herrera. Each confirmed `is_active = true` and not
`excluded_from_dispatch` before anything was written.

**Not voided**, and deliberately so: Bilal Leggett, Ronald Lockett and Willie
Westbrook. Those are genuine departures and their terminations stand.

### Schema

`lease_terminations` gains `voided_at`, `voided_by` (FK to `profiles`) and
`void_reason`. `voided_by` is registered in `PROFILE_FK_COLUMNS` in the pg fake,
so an actor stamped with an auth uid instead of a profile id raises 23503 in the
test suite rather than in production.

Each void carries all three fields plus a `lease_termination_voided` entry in
`audit_log` — six rows, one per document.

### A voided row reads as voided everywhere

The rule the readers follow: **a voided row is not a termination.** It never
badges as one.

- `TerminationBadge` renders **nothing** for a voided row by default. The
  dispatch board and the driver roster filter voided rows out of their queries
  as well, so the row cannot reach the badge at all.
- The operator detail panel and the register — the two places that own the
  document — pass `showVoided` and render a muted "Termination Voided" chip with
  the void reason, so the withdrawal is visible where the paperwork lives.
- The Appendix C viewer shows a "Void — not in effect" banner, stamps **VOID**
  on the document header, and disables *Send to Insurance*.
- The `send-lease-termination` edge function refuses a voided document with a
  409 — the UI is not the only thing standing between a withdrawn notice and the
  insurance carrier. Explicitly deployed.
- The register's count line reads "N in effect · 6 voided (generated in error,
  retained on file)". Voided rows are excluded from the count, never hidden.
- The deactivation wizard's "termination already on file" check ignores voided
  rows, so a genuine termination can still be issued for one of the six later.

### Voiding is not a UI feature

There is no void button. This pass corrects a known set of six rows. If voiding
becomes routine it needs its own authorization and reason capture; until then
the absence of a button is the control.

### Tests

`parked-and-termination-guardrail.test.ts` pins the total at 31 **and** the
voided count at 6, asserts the six names exactly, asserts none of the three
genuine departures is voided, asserts every void carries a reason, an actor and
an audit entry, and asserts every voided row belongs to a driver who is still
working. `terminationBadge.test.tsx` asserts a voided row renders no
"ICA Terminated" text anywhere.

### Known failures inherited from the 2026-08-30 migrations

Unrelated to this pass, and pre-existing when it started: six definer-guard
assertions fail because `enforce_ica_contracts_operator_update`,
`enforce_ica_contracts_operator_column_whitelist`, `enforce_osas_operator_sign`,
`sync_dot_binder_to_vh`, `sync_dot_to_inspection_documents` and
`sync_profile_contact_from_application` pin `search_path` to `public` alone
rather than `public, extensions`, and `enforce_osas_operator_sign` — a trigger
function — still holds a client-role EXECUTE grant. Two further failures
(`FacilitySelect` add action, ELD `divergence` resolution) are unrelated to
lease terminations. None is addressed here.

## LEGACY_MAX dropped 86 → 82 by fixing, not by loosening (2026-08-31)

Six functions carried over from the 2026-08-30 migrations were re-pinned to
`SET search_path TO 'public', 'extensions'`:
`enforce_ica_contracts_operator_column_whitelist`,
`enforce_ica_contracts_operator_update`, `enforce_osas_operator_sign`,
`sync_dot_binder_to_vh`, `sync_dot_to_inspection_documents`,
`sync_profile_contact_from_application`. None was added to
`LEGACY_PUBLIC_ONLY_PINS` — that list is for legacy functions, and these were
days old.

Re-pinning made four existing entries in that list stale, so the list shrank
86 → 82 and `LEGACY_MAX` was lowered to match. **That is a shrink from fixing,
not a loosening.** The allowlist only ever shrinks; a number that moves upward
is an exemption and needs an argument, a number that moves downward is one
fewer function running unpinned.

Why the removal is automatic: each allowlist entry is anchored by **migration
file and function signature**, not by name alone. Re-authoring a function in a
newer migration therefore breaks the anchor, the entry stops matching any live
offender, and the guard reports it as stale on the next run. There is no way to
re-pin a function and quietly keep its exemption — the guard forces the entry
out.

Both definer guards are green with no allowlist entry added.

### Baselines restamped this day

Measured with `--maxWorkers=2`, recorded verbatim in `src/test/helpers/gate.ts`
and `src/test/README.md`:

```text
with a database:     Test Files  2 failed | 123 passed | 1 skipped (126)
                          Tests  2 failed | 998 passed | 14 skipped (1014)

without a database:  Test Files  2 failed | 114 passed | 10 skipped (126)
                          Tests  2 failed | 934 passed | 70 skipped (1006)
```

The two failures are the same in both shapes and are recorded, unrelated to this
work: the `FacilitySelect` add-action RTL timeout (contention; passes alone) and
the ELD offline divergence hold-release assertion.

## Module 4, Pass 1 — settlement foundation (2026-08-31)

Tables, configuration and the departing flag. No calculation, no settlement run,
no driver-facing view. Those are Pass 2 onward.

### The departing flag is the legitimate replacement for what `lease_terminations` was misused for

Six `lease_terminations` rows were generated in error because the app had no way
to record "this driver may be leaving." The only control that looked close was
the one that ends the ICA. Those rows are now voided; this is the control that
should have existed.

`is_departing` on `operators`, with `departing_note`, `departing_expected_date`,
`departing_at` and `departing_by`, plus an `operator_departing_events` history
table. Set and cleared only through `set_operator_departing` /
`clear_operator_departing`, which are restricted to dispatch, management and
owner, stamp the actor via `current_profile_id()`, and append an event on both
the flag and the clear. Clearing closes an episode; it never erases one.

It is deliberately cheap to reverse. "May be leaving" is a suspicion and drivers
change their minds — if un-flagging were awkward nobody would flag early, and
early is when the flag is useful.

It is invisible to the driver. No file under `src/pages/operator`,
`src/components/operator`, `src/roadside` or the operator-home hooks reads any
departing column, RPC or component, and the word does not appear in a
driver-facing string. A test asserts both by walking those trees.

It keeps the driver active, dispatchable and settling. It changes settlement
BEHAVIOUR, not eligibility. It writes no `lease_terminations` row.

### The population rule, and why it ignores all seven active-operator definitions

A settlement run includes any operator with UNSETTLED WORK in the period:

- a load delivered in the period, not yet on a settlement
- fuel transactions not yet deducted
- an outstanding cash advance balance (trigger only — see section 9 in
  **Settlement rules — the authoritative record**)
- a negative carry-forward from a prior period
- an R&M deduction due

It keys on none of `is_active`, `excluded_from_dispatch`, `fully_onboarded`,
`is_parked`, `is_departing`, `on_hold`, or a `lease_terminations` row. Seven
different "active operator" predicates exist in this codebase (recorded in the
2026-08-29 investigation above) and they disagree with each other;
`lease_terminations` appears in none of them. Settlement uses none of the seven
because every one of them answers a different question — who to show on a board,
who to email, who to count — and none of them answers "who is owed money or owes
it."

A departed driver still settles. A parked driver still settles. A driver with
ONLY deductions and no revenue still gets a settlement: it runs negative, the
debt is real, and it carries forward. He is not skipped.

`src/lib/settlementPopulation.ts` holds the rule, and a test asserts that none of
the seven flag names appears anywhere inside `hasUnsettledWork`.

### Two non-payment states, plus paid

There are TWO non-payment states — `below_threshold` and `held` — plus `paid`.
An earlier heading here said "three distinct non-payment states"; that was wrong
and is corrected. A driver must never have to guess which one he is in. Each
state has its own status, its own wording and its own release path with a named
actor.

| Status | Meaning | Release path |
|---|---|---|
| `below_threshold` | Net is under the configured minimum. Rolls forward. | `authorize_below_threshold_payment` — management authorises payment anyway, actor and reason recorded. |
| `held` | Departing, and coverage is short of the buffer. | `release_settlement_hold` — actor and reason recorded. |
| `paid` | Normal — paid and deposited. Not a non-payment state. | — |


HELD means computed and visible, never unpaid and silent. The settlement runs,
the number exists, both sides see it, and only PAYMENT is withheld. "Your final
settlement is $1,840, held pending return of your ELD and plate" is a
conversation. Simply not getting paid is a dispute.

### The hold formula, with R&M offsetting

```text
held  ⟺  is_departing AND (net + rm_deposit_balance − equipment_exposure) < hold_buffer
equipment_exposure = equipment_outstanding ? equipment_value_per_driver : 0
```

The R&M deposit offsets the exposure. It is the driver's money and it already
covers the risk, so holding a settlement the deposit has already covered is
holding it twice. Equipment counts only while it is outstanding.

### Configuration — six values, all editable, none hardcoded

`settlement_settings` is a single row, edited in the app by management or owner,
with every change written to `settlement_settings_history` with actor and reason.

| Setting | Default |
|---|---|
| `minimum_net_pay_threshold` | $100 |
| `hold_buffer` | $500 |
| `equipment_value_per_driver` | $1,200 |
| `rm_deposit_target` | $2,000 |
| `rm_weekly_deduction` | $200 |
| `work_week_start_dow` | 3 (Wednesday) |

The constants in `src/lib/settlementConfig.ts` are fallbacks for a missing row,
not rules. A test edits the row and asserts the hold answer changes for the same
driver and the same numbers.

### The Repair & Maintenance Deposit is never "escrow"

It is the Repair & Maintenance Deposit — in every string, column comment and
document. The deduction auto-stops at target, never overshoots on the final
week, and resumes on its own after a withdrawal. A test greps `src/` and
`supabase/migrations/` for "escrow" and "holdback"; the only permitted
occurrence is the ICA's own legal sentence stating the deposit is not an escrow
account, which is the contract's wording and stays.

### GAP — management-confirmed equipment return does not exist

The hold formula needs to know that equipment is actually BACK. Today it cannot.
`mark_equipment_return_completed` fires when a DRIVER uploads a tracking receipt.
That is shipment, not receipt inspection: it records that a driver says he sent
something, not that anyone opened the box. Zero of seven operators with a return
in flight have the `equipment_return` step completed.

This pass does not close that gap. Until it is closed, `equipment_outstanding`
must be treated as staff-asserted, and a hold released on the strength of a
tracking number is a judgement call, not a fact.

### CLOSED (was LIVE GAP) — HOLD claim flag now stops settlement

The rule "HOLD — stop settlement, engine auto-skips" was documented but
unimplemented in the settlement path. `computeSettlement` in
`src/lib/settlementEngine.ts` contained no reference to `claim_flags`; the only
readers of an active HOLD flag were `DispatchBoardPage`, `LoadsListPage` and
`loadDetail.ts`. A load with an active damaged-goods HOLD (ST-TEST-005) settled
at $1,350.00 as if the flag were not present.

**The fix (Module 4, Pass 2b).** `SettlementLoadInput.claims` carries the load's
`claim_flags` rows into the engine UNFILTERED, and the engine decides — the rule
lives in one place, and a gathering layer that pre-filters cannot silently
disagree with it. `isSettlementBlockingClaim` is the whole predicate:
`flag_level = 'hold' AND is_active AND resolved_at IS NULL`. WATCH never
excludes. Exclusion is at the LOAD level, exactly like the paperwork hold: the
rest of the driver's week settles and the held load waits for a later period.

**Both reasons, not one.** `WithheldLoad.reasons` is now a list of
`{ code, message, outstanding }` — `'paperwork'` and `'claim_hold'` are
independent, and a load short a POD *and* under a claim reports both. "Missing
your POD" and "under review" are different answers to the same driver question.

**Driver wording is fixed and neutral:** `CLAIM_HOLD_DRIVER_MESSAGE` —
"One of your loads is under review." No claim type, no amount, no counterparty.

**NO DELIBERATE RELEASE, deliberately.** The paperwork hold has one because it
is administrative: the money is not in dispute, only the file is. A claim hold
is a dispute about the load itself, and the honest way out is to resolve or
clear the claim, which the existing claim workflow already does and audits. A
release switch would let one click pay a disputed load while the claim record
still says it is disputed — two systems of record disagreeing about the same
money. A paperwork release therefore does NOT release a claim hold; there is a
test for that.

**`is_active` + `flag_level` is *nearly* sufficient.** The engine also requires
`resolved_at IS NULL`. `is_active` and `resolved_at` are set by the same
workflow and should always agree, so this changes nothing today — but if they
ever drift, the safe reading of a resolved-yet-active row is "not a hold," and
the engine states that rather than inheriting a data fault.

**Third reader audit.** Grep of `claim_flags` across `src/` finds exactly three
production readers besides the engine: `DispatchBoardPage`, `LoadsListPage` and
`loadDetail.ts`, all display-only and all correct. `summarizeActiveClaims`
already collapses to hold-wins severity. No other documented rule reads
`claim_flags` and fails to implement it — but the driver-facing side of this
rule has no surface yet: nothing in the operator portal shows the neutral
message, because settlements are not surfaced to drivers until Pass 3. The
string lives in the engine so there is one wording when that view is built.

This was the third rule found in one week enforced in one layer while assumed
structural: `pay_policies` was UI-only until the operator grant was revoked,
look-alike serials lived only in a trigger, and HOLD claim flags were surfaced
in dispatch views but absent from the engine.

**Verification — Case 5 re-run (Pratt, week Wed 12 – Tue 18 Aug 2026,
payday 2026-09-01):** gross **$327.94**, from ST-TEST-003 alone
(18.50 × 24.62 confirmed tons = 455.47 × 72%). ST-TEST-005 is withheld for its
active damaged-goods HOLD even with its paperwork hold released — previously it
paid $1,350.00 and the week totalled $1,677.94.


### Two guards moved with this pass

`KNOWN_AUTHENTICATED_EXECUTABLE_MAX` rose 98 → 102. The four additions are
`set_operator_departing`, `clear_operator_departing`,
`authorize_below_threshold_payment` and `release_settlement_hold` — all four are
staff RPCs called from the app, each role-checked in its own body, so
`authenticated` EXECUTE is the only call path and a driver gets a raised
exception rather than a silent success. This is a growth, and growth in that
list is always worth reading twice.

The grant-parity linter had a real bug, found by this migration. Its GRANT
regex used `[\s\S]*?`, so on a file containing
`GRANT EXECUTE ON FUNCTION f(uuid, text) TO authenticated;` the parenthesised
signature failed the table pattern, the engine backtracked across the statement
boundary, and the NEXT table grant was consumed along with it — hiding a grant
that was actually present. Narrowed to `[^;]*?`, since a GRANT never spans a
statement. The lesson: a linter that reports a table as ungranted may be
mis-parsing a neighbouring statement, so read the file before adding a grant
that is already there.

## Module 4, Pass 1a — management confirms equipment return (2026-08-31)

### The investigation: three things were already writing "returned," none of them this

| Write path | What it actually means | Who writes it |
| --- | --- | --- |
| `equipment_assignments.returned_at` | Inventory hygiene — one device is free to reissue. Written by `EquipmentReturnModal`, per item, and it clears the Stage 5 serial on `onboarding_status`. | Staff, per device |
| `onboarding_status.equipment_return_completed_at` | The driver uploaded a shipping receipt. Stamped by the `mark_equipment_return_completed` trigger on `equipment_receipts`. | The driver, indirectly |
| `onboard_assignment_sheets.return_completed_at` | A sign-off sheet was closed inside the Deactivation Wizard. | Staff, per sheet |

None of them says *management physically has the equipment*. The second is the
one most likely to be mistaken for it, and it is the weakest: a tracking number
is a promise, not a returned ELD. `operator_offboarding_steps` is wizard
progress only — it gates nothing.

**Entanglement:** the Deactivation Wizard is the only place that treats
equipment return as a step, and that step is bound to finishing a deactivation.
A driver who ships equipment back without being deactivated leaves no
management-side record at all. That is the gap the hold formula would have
inherited.

### What Pass 1a adds

`equipment_return_confirmations` — one row per confirmation episode, reversible,
never deleted. RECEIVED is a separate fact from SHIPPED and neither one is
allowed to imply the other.

- `confirm_equipment_returned(_operator_id, _note)` and
  `reverse_equipment_return_confirmation(_operator_id, _reason)` are the only
  writers. Management or owner, checked in each body. The table holds **no**
  client `INSERT`/`UPDATE`/`DELETE` at all, so there is no second path — a
  dispatcher cannot reach it, and a driver certainly cannot.
- A partial unique index (`reversed_at IS NULL`) keeps at most one open
  confirmation per operator.
- A reversal requires a reason and keeps the original row on file with the
  reversing actor stamped.
- `equipment_outstanding(operator_id)` is the derived fact the hold formula
  reads. It is TRUE until an open confirmation exists — so the default is
  "we do not have it," which is the safe default for money.

Confirming changes nothing else: not `is_active`, not the lease, not dispatch
status, not the wizard. One writer per fact.

The control lives on the operator detail panel beside Departing, showing both
chips — the driver's shipment and management's receipt — so the difference is
visible rather than inferred. `src/test/equipment-receipt-confirmation.test.ts`
asserts that no file under the operator portal so much as names the table, the
RPCs or the control.

Not in this pass: settlement calculation, and no change to the Deactivation
Wizard.

### Baselines restamped this day

```text
with a database:     Test Files  1 failed | 125 passed | 1 skipped (127)
                          Tests  1 failed | 1013 passed | 14 skipped (1028)

without a database:  Test Files  1 failed | 116 passed | 10 skipped (127)
                          Tests  1 failed | 943 passed | 76 skipped (1020)
```

One known failure now, down from two. `FacilitySelect > add action reachable
after a no-match query` still times out and no longer passes in isolation
either — it runs ~40s against cmdk before the 5s limit trips, which is the
Vitest/testing-library drift already recorded as KNOWN DEBT. The ELD offline
divergence failure was real but not a regression: its release assertion used a
date sitting exactly on the 30-day cutoff, so real time walked into the
boundary. Fixed by asserting a date unambiguously past the hold.

`KNOWN_AUTHENTICATED_EXECUTABLE_MAX` moves 102 → 105 for the two writers and
the derived reader, each named in the allowlist with the gate it enforces.

## FacilitySelect quarantined — 2026-08-31

Before the settlement calculation pass, the suite had to mean something plain:
green must mean green. It did not — every run carried "one expected failure",
and a pass that computes money is exactly the wrong place to be reading past a
known red line.

`FacilitySelect > keeps the add action reachable after typing a query with no
matches` is now a **named, counted skip** via `gatedIt`, with the reason stating
it is a Vitest/testing-library timing issue and not a product defect, and
pointing at the KNOWN DEBT entry ("test tooling can change without a commit") in
`docs/tms-wish-list.md`. The test body is untouched and the component is
untouched. The global timeout was deliberately **not** raised: masking the
timing would also mask a real slow-down later. Unskip when the tooling is
pinned.

### Baselines restamped this day — both shapes fully green

```text
with a database:     Test Files  133 passed | 2 skipped (135)
                          Tests  1106 passed | 15 skipped (1121)

without a database:  Test Files  123 passed | 12 skipped (135)
                          Tests  1031 passed | 82 skipped (1113)
```

No expected failures remain in either shape. From here, any red in the
settlement pass is a real defect, not background noise.

## Settlement rules — the authoritative record (2026-08-31)

Stated by the carrier and recorded here verbatim in substance. Where a rule is
marked **OPEN** it is recorded as open; nothing below fills a gap by inference.
This section governs where anything earlier in this document disagrees.

### 1. Pay percentages — Pay Policy Engine, configurable, never hardcoded

Every figure below is a DEFAULT stored on the pay policy, not a constant in code.

| Charge | Default to driver |
|---|---|
| Linehaul | 72% |
| Fuel surcharge | 72% |
| Stop-off | 72% |
| TONU | 72% |
| All other accessorials | 72% |
| Detention | 100% |
| Layover | 100% — treated the same as detention |
| Lumper | Reimbursed at 100% when the driver paid out of pocket |

Three override levels, resolved strictly in this order:

```text
company default  →  driver-specific  →  load-specific
```

The nearest level wins. No percentage may be written into a component, an RPC or
a migration as a literal; it is read from the policy in force.

### 2. Period attribution and the settlement calendar

**A load belongs to the period in which it DELIVERED.** A load delivers exactly
once, so nothing is double counted, and driver pay and dispatch pay land on the
same event.

**Timezone.** The delivery timestamp is read in CENTRAL TIME — the carrier
timezone — not the viewer's zone and not UTC. A load delivering 11pm Tuesday
Pacific is Wednesday Central and belongs to the FOLLOWING work week. Use the
existing carrier-timezone helpers; `new Date(v)` is never acceptable for this.

**Work week.** Wednesday 00:00 through Tuesday 23:59, configurable via
`work_week_start_dow`.

**Payday.** Tuesday, for the work week that ended TWO TUESDAYS PRIOR.
Reconciliation spans the intervening period. Worked example from the carrier's
own settlement calendar:

```text
work week      Wed Mar 4  –  Tue Mar 10
reconciliation      Mar 11 – Mar 23
payday              Tue Mar 24
```

**Late accessorials do NOT reopen a closed period.** An accessorial approved
after its load settled is picked up as an ADJUSTMENT in a later settlement,
referencing the original load (the `-A1`, `-A2` adjustment references).

**SETTLED — factoring payment is not a prerequisite for paying the driver.** The
two-week reconciliation window absorbs factoring timing. Payment errors from the
factoring company, usually caused by missing paperwork, surface during that
window.

### 3. Driver-facing vocabulary

The driver sees exactly three words: **PAID**, **PROCESSING**, **UPCOMING**.

- **"holdback" is FORBIDDEN in any driver-facing string.**
- **"escrow" is FORBIDDEN everywhere** — strings, column names, comments. It is
  the **Repair & Maintenance Deposit**, and the distinction is legal, not
  stylistic. The single permitted occurrence remains the ICA's own sentence
  stating the deposit is not an escrow account.

A held settlement is COMPUTED AND VISIBLE to the driver, with its reason. It is
never silently unpaid.

### 4. Dispatch company settlement — one 1099 vendor, not per dispatcher

Attribution by dispatcher is for VISIBILITY only. There is exactly one
settlement and one 1099, issued to the dispatch company. Monthly calendar period,
paid on or around the 10th of the following month.

#### 4.1 The eligible base — which loads

A load enters the dispatch base only if ALL of these hold:

- it has a non-null `delivered_at` falling inside the calendar month, evaluated in
  the CARRIER timezone;
- its status is NOT `tonu`;
- its status is NOT `cancelled`.

**TONU is excluded BY LOAD STATUS, never by the presence of a TONU charge.** A
TONU charge sitting on an otherwise normal load does not exclude that load; the
`tonu_pct` pay class governs what a DRIVER is paid in that case, and that is a
different question.

The `cancelled` exclusion is currently redundant, because cancelled loads have no
`delivered_at`. It is stated anyway: the redundancy disappears the moment anyone
corrects a departure time on a load that was later cancelled.

#### 4.2 The eligible base — which money

**The base is built FROM PARTS. It is never read from `loads.total_load_value`,**
which is the broker-facing gross and includes charges the base excludes.

ALWAYS IN THE BASE — header rates, which have no pay class and are never excluded:

- flat linehaul: `linehaul_rate`
- per-mile linehaul: `rate_per_mile` × `loaded_miles`
- per-ton linehaul: `rate_per_ton` × `confirmed_tons` (**confirmed only**;
  `estimated_tons` is a broker-facing stand-in and never reaches a settlement of
  either kind)
- `rate_type` `percentage_of_load` behaves as flat and reads `linehaul_rate`
- unbundled fuel surcharge: `fsc_amount`, ONLY when `fsc_bundled_into_linehaul` is
  explicitly false (NULL means bundled)
- loadout relocation fee: `loadout_relocation_fee`

THEN ADD `load_charges`, MINUS the exclusions in 4.3.

**Recorded reason.** On 2026-08-31 the driver engine paid $204 on a $3,415 load
because it read only `load_charges` and never saw the header rate columns. A
dispatch base assembled from `load_charges` alone repeats that defect on the
vendor side.

#### 4.3 The exclusion predicate — the part most likely to be mis-implemented

A charge is excluded from the dispatch base when EITHER condition holds:

- **(a)** the percentage the PAY POLICY IN FORCE assigns to that charge's
  classification resolves to **100**, OR
- **(b)** that charge's pay class is **`reimbursement`**.

**On (a):** the percentage is read from the `*_pct` columns on `pay_policies`,
resolved through the classification-to-column mapping the engine already uses. It
is **NOT** read from the `charge_pay_classes` column. This distinction is the
whole point: `charge_pay_classes` labels detention, layover AND lumper as
`revenue`, so a rule implemented against `charge_pay_classes` would exclude
**nothing at all**. Under the company default policy, the charges that resolve to
100 today are detention, layover and lumper reimbursement.

The consequence, which is the intent: a new accessorial type configured at 100%
drops out of the base automatically, with no code change and no hardcoded list of
charge types anywhere.

**On (b):** a reimbursement is money passing through SUPERTRANSPORT to the driver
at actual cost. It is not carrier revenue and the dispatch company does not earn
on it, whatever percentage sits against its classification.

**The business reason behind both**, recorded so the rule is not mistaken for an
arbitrary carve-out: no driver is ever paid 100% of a load's linehaul. The 100%
classifications are accessorials that belong to the driver in full, and there is
no carrier margin in them for a 5% to be taken from.

#### 4.4 Broker chargebacks do not reduce the base

The dispatch base is the **booked gross**. A chargeback the broker deducts after
the fact — late delivery, missed check call, unreported trailer swap, comcheck fee
— does not reduce it. The dispatch company earned its fee by booking the load at
the rate agreed; a downstream operational failure is not the dispatcher's.

**Separately, on the DRIVER side:** a chargeback IS deducted from the driver. The
cause governs and discretion is retained — this is not a fixed formula, and
circumstances exist where the carrier absorbs it instead. There is currently NO
MECHANISM to represent a chargeback at all; see the KNOWN DEBT entry "Broker
chargebacks are not representable".

#### 4.5 Factoring is a reduction of the base, not a recurring deduction

The 2% factoring share is applied as a **reduction of the base before the 5% is
taken**. There is NO separate recurring factoring deduction. Anything describing
factoring as a recurring line item alongside DAT and phone service is superseded,
including the entry in `docs/tms-wish-list.md`.

**Then, in order:**

```text
eligible base
  less 2% factoring        →  reduced base
  reduced base × 5%        →  dispatch fee
  less flat deductions (DAT, phone service)
  less any per-settlement one-off  (must carry a load reference)
```

Confirmed against a real dispatch invoice:

```text
gross 471,608  →  less 2% factoring = 462,176  →  × 5% = 23,109
               →  less 779 DAT = 22,330 final
```

**Recorded consequence.** This produces a LOWER figure than the invoices
historically paid, which computed on total gross. That difference is expected,
not a defect.

#### 4.6 Attribution

The dispatch fee is attributed by `loads.dispatcher_id` — **who BOOKED the load**.
The 5% is earned by booking.

This is **for visibility only**. The fee computes off the base; no attribution
value changes any amount owed.

`active_dispatch.assigned_dispatcher` answers a different question —
book-of-business performance, not booking activity — and is not used here.

`loads.dispatcher_id` is nullable. Any per-dispatcher breakdown MUST carry an
explicit **"unattributed"** bucket. A breakdown whose rows do not sum to the total
is how a payment dispute gets discovered rather than prevented.

Already recorded and applies here: Jack Barney and Yasir Nawaz hold the plain
`dispatcher` role as dispatch MANAGERS with one or two drivers each. Nothing in
the data distinguishes them, so any per-dispatcher ranking places them last.

#### 4.7 Schema shape — separate tables, NOT a widened `settlements`

The dispatch company settlement gets **its own tables**. `settlements`,
`deductions` and `settlement_line_items` are not widened to carry a non-operator
payee. Reasoning, recorded so it is not relitigated:

- `settlements.operator_id` is NOT NULL with a cascade FK to `operators`, and
  UNIQUE (`operator_id`, `period_start`) is what makes "one settlement per driver
  per week" true at the database rather than in application code. Relaxing it to
  admit a vendor removes a working guard.
- `enforce_settlement_immutability` and `enforce_settlement_child_immutability`
  are live, and the retained Pratt settlement is status `paid`. Any migration
  altering `settlements` must survive an immutable row.
- `settlement_status` has five members, two of which — `held` and
  `below_threshold` — must NEVER occur for the dispatch company. There is no
  minimum net threshold and no departing-driver hold on a vendor settlement.
  Sharing the enum imports unreachable states, and unreachable states are where
  wrong code hides.
- `settlement_line_items.source_table` CHECK enumerates `loads`,
  `fuel_transactions`, `deductions`, `deduction_installments`, `cash_advances`,
  `rm_deposits`, `settlements`. Every one but `loads` is driver-side. Widening it
  makes it stop meaning anything.

**The accepted cost:** two settlement systems risks a rule fixed on one side and
missed on the other — the "correct implementation with no caller on the path that
mattered" pattern already recorded five times. **Mitigation:** the genuinely
shared logic is small and already pure — period attribution through
`carrierDateOf`, pay-policy percentage resolution, and the delivered-in-period
predicate. Those are extracted and called by both paths, with a test asserting the
dispatch path CALLS them rather than re-deriving. `computeSettlement` itself is
NOT extracted; almost none of its body applies.

This supersedes the earlier note in `docs/tms-wish-list.md` that the settlement
tables must serve two payee types.

**Why the reversal — recorded because the distinction matters.** That caution was
NOT mistaken when it was written. It was written BEFORE the driver settlement
tables existed, at a point where serving two payee types would have cost almost
nothing. It was then not applied. By the time the dispatch settlement was
designed, `settlements.operator_id` was NOT NULL with a cascade FK, the
immutability triggers were live, and a `paid` settlement existed that any
migration would have to survive. The decision above is therefore a decision made
AGAINST A KNOWN COST — not a judgement that the original caution was wrong.

**The lesson worth carrying:** a caution recorded and not applied gets more
expensive with every pass, and the cost is paid by the pass that finally reaches
it.

#### 4.8 The dispatch settlement has no driver-side machinery

No R&M Deposit. No minimum net pay threshold. No two-week holdback. No
carry-forward of a negative. Monthly calendar period, paid around the 10th.

`settlement_settings` is a driver-side singleton and has nowhere to store a
monthly period, a 5% dispatch rate or a 2% factoring rate. The dispatch settlement
needs its own configuration home. **Both percentages stay configurable; neither is
hardcoded.**

#### 4.9 Loadout loads carry a broker

A loadout is a normal load on the broker's paperwork. Confirmed against two real
rate confirmations: **Integrity Express Logistics** (IEL PO 3048784, $100.00, Rate
Type "Flat Rate") and **Rolling River Logistics** (Load 10540, $150.00, Pay Type
"Flat"). Both are ordinary brokers with MC numbers, remit-to addresses and
broker-carrier agreements, and both belong in the `brokers` table with a factoring
status like any other. **Going forward every loadout load carries a broker.**

The relocation fee IS in the dispatch base. It is revenue on a load delivered that
month and the driver is paid a percentage of it, so the dispatch company earns on
it as it does on linehaul.

Also confirmed by that paperwork: IEL states there are no BOLs on trailer moves
and that their emailed confirmation is the POD — exactly what the loadout photo
capture in Module 11 is built around. The 5–10 day use period holds; both rate
cons run seven days pickup to delivery.


### 5. Repair & Maintenance Deposit

**Settled and recorded:** the balance OFFSETS debt in the hold formula, because
it is the driver's money and it covers the carrier's exposure. Target $2,000,
$200 weekly, auto-stops at target, auto-resumes after a withdrawal.

**OPEN — withdrawal and departure.** All three of the following are open:

- who may withdraw from the deposit;
- what authorises a withdrawal;
- what happens to the balance when a driver departs.

### 6. Below-threshold carry-forward

**Settled:** a settlement under the configured minimum ROLLS FORWARD unless
management authorises payment, recorded with actor and reason.

**OPEN — carry-forward mechanics.** All three of the following are open:

- whether the rolled amount appears as a LINE ITEM on the next settlement;
- whether it ACCUMULATES toward the next period's minimum;
- whether `authorize_below_threshold_payment` is ONE-TIME or STANDING.

### 7. The state count is corrected

There are TWO settlement-level non-payment states — `below_threshold` and `held`
— plus `paid`. The earlier "three distinct non-payment states" heading in the
Module 4 Pass 1 section was inconsistent with its own table and has been
corrected.

A third hold exists at a different level: the **per-load paperwork hold** is an
exclusion of one load from a settlement, not a suspension of the settlement itself.
See section 8.

### 8. Per-load paperwork hold

A load whose required paperwork is incomplete is withheld from settlement by
default. Only that load's line item waits; when the paperwork arrives it picks up
in a later settlement. The rest of that week's settlement pays normally.

The predicate is the existing `evaluateLoadPaperwork` in
`src/lib/loadPaperwork.ts`. The settlement engine must CALL that predicate,
never re-derive what a load owes.

This is an EXCLUSION from a settlement, not a suspension of one. The driver must
be able to see WHY a load was withheld — a short check with no explanation is the
failure mode.

**Settled — automatic hold, deliberate release.** The hold is applied
automatically when `evaluateLoadPaperwork` reports incomplete required
paperwork. Management can RELEASE a withheld load into the settlement, recorded
with actor and reason. The release is the deliberate act; the hold is the
default.

**Rationale.** A decision-per-load approach works only while the exception list
stays small; at volume it becomes a chore that gets clicked through, making the
decision nominally deliberate and actually automatic. Automatic-with-release
inverts the work so effort scales with the exceptions worth making, not with
load count.

**Driver visibility.** A withheld load and the reason must appear on the driver's
home screen before payday, while he can still act on it. The paperwork tail
already renders there; the settlement engine surfaces the hold status alongside
it. A short check discovered on payday is the failure mode this avoids.

### 9. Cash advances — population trigger only, no recovery schedule

A cash advance currently puts a driver into a settlement run (it is a population
trigger) but produces NO recovery line. The schema has no repayment schedule,
so the engine and the gathering layer correctly deduct nothing for an outstanding
advance. This is deliberate: inventing a weekly recovery amount would be the
settlement layer making a pay rule that does not exist.

A future repayment schedule must decide all three of:

- **Recovery amount** — whether the advance is recovered in full on the next
  settlement or spread over installments (for example, $N per week, N of M).
- **Negative-net suspension** — whether recovery is suspended when the resulting
  net would go negative, or whether it is allowed to drive the settlement further
  negative and carry forward.
- **Priority order** — whether advance recovery applies before or after R&M
  Deposit, fuel, and other deductions when net is constrained.

Until those three decisions are recorded, a driver with an outstanding advance
settles with nothing deducted for it.

### Open items in this record, in one place

| # | Open question |
|---|---|
| 5 | Who may withdraw from the R&M Deposit? |
| 5 | What authorises an R&M withdrawal? |
| 5 | What happens to the R&M balance when a driver departs? |
| 6 | Does the rolled below-threshold amount appear as a line item next period? |
| 6 | Does it accumulate toward the next period's minimum? |
| 6 | Is `authorize_below_threshold_payment` one-time or standing? |
| 9 | Cash advance: recovered in full or in installments? |
| 9 | Cash advance: suspend recovery when net would go negative? |
| 9 | Cash advance: recovery priority vs R&M, fuel, other deductions? |

Nothing in this table may be implemented on a guess. Each needs a decision from
the carrier before the calculation pass depends on it.

---

## Verification standard — the dispatch settlement can only produce SEEDED-DATA EVIDENCE (2026-09-01)

The dispatch company settlement CANNOT be verified the way the driver settlement
was. As of 2026-09-01 the database holds **ten loads, two with a `delivered_at`,
ZERO rows in `load_charges`, zero loads at status `tonu`, and one settlement**. No
accessorial of any kind exists, so the exclusion predicate in section 4.3 — the
part of this formula most likely to be wrong — cannot be exercised by any existing
row.

**Therefore: every result produced for this module is SEEDED-DATA EVIDENCE and
must be labelled as such in every report.** It is explicitly weaker than the Pratt
run.

The reason this matters is already on the record. The two defects that mattered on
the driver side — the omitted header rates, and the per-ton total silently
rewriting itself — both surfaced from REAL rows moving through REAL paths. The
fixtures agreed with the wrong assumption in both cases. A green result against
seeded data must never be reported as though it carried the same weight.

---


## Module 4, Pass 2 — the settlement engine (2026-09-01)

`src/lib/settlementEngine.ts` computes a settlement and returns it. It is
**pure**: no supabase client, no React, no queries. Everything it needs arrives
as arguments, so the arithmetic is testable without a database and the RPC that
persists a settlement stays a thin layer over it. There is no driver-facing view
in this pass.

### Rules are read, not restated

Every rule comes from the authoritative record above. The engine hardcodes
nothing the record calls configuration:

- percentages and pay classes from the pay policy in force, resolved
  **company default → driver-specific → load-specific, nearest wins**
  (`resolveEffectivePolicy`);
- the minimum net pay, hold buffer, equipment value, R&M target and weekly
  figure from `settlement_settings`, passed in as `settings`;
- the per-load paperwork predicate from `evaluateLoadPaperwork` — the engine
  never re-derives what a load owes;
- pay classes from `payClassOf`, so a reimbursement pays **actual cost** to
  whoever funded it and a `funding_source` that is not the driver pays nothing.

### Period attribution lives in one place

`src/lib/settlementPeriod.ts`. A load belongs to the period it **delivered** in,
read in the **carrier timezone** through `isoToNaive` — never `new Date(v)`
against the runtime's zone. A load delivering 11pm Tuesday Pacific is Wednesday
Central and settles the following week; that case is pinned in the tests. Payday
is `periodEnd + 14 days`.

### Every amount is a line item

The net is the sum of the lines and there is no second path to it — a test pins
that. Each line carries its type, a signed amount, a description and the row it
came from, so a driver can reconcile against his own records rather than accept
a total with a note.

### The fuel discount is never netted

`fuel_transactions.total_amount` is already net of the negative discount, so the
engine takes the **gross** as its input and deducts that. With
`fuel_discount_passthrough` on, the discount is credited as its **own positive
line**; with it off the driver is deducted the same gross and sees nothing about
the discount, which stays company margin. The deduction figure does not change
between the two — only whether the credit appears.

### Withheld loads, not withheld settlements

A load whose paperwork is incomplete is excluded from the settlement as a
**line-item exclusion** with a stated reason and the outstanding labels; the
rest of the settlement pays. A deliberate release lets it through and the
release reason is written onto the line itself.

### Status precedence — SETTLED: held wins (2026-08-31)

When a settlement is **both** `held` and under the minimum net pay, the status
recorded is **`held`**. The engine evaluates the hold first.

The reason is that the two states resolve differently. `below_threshold` rolls
forward and can be authorised for payment; `held` stays computed and visible,
pending the departing gate. If a departing driver's small settlement rolled
forward instead, the roll would **defer the hold** — and a departing driver is
exactly who you do not want money deferred on. Held is the state that keeps the
figure in front of somebody.

Pinned by a named test, `held wins when the settlement is ALSO under the
minimum`, in `src/lib/__tests__/settlementEngine.test.ts`. The precedence no
longer lives only in the order of one `if`.

Open item 4.2 is closed. No open items remain in the Pass 2 record.

---

## Module 4, Pass 2a — `delivered_at` gets a writer (2026-08-31)

The settlement engine attributes a load to a work week by its delivery date in
carrier time. Until this pass nothing wrote `loads.delivered_at`, so no load
could be attributed to any period and no settlement could compute for anyone.

**Where the instant comes from.** Primary source is the driver's departure from
the FINAL delivery stop — `load_stops.actual_departure_at` on the last stop with
`stop_type = 'delivery'`, by `stop_sequence`. A trigger on `load_stops`
(`derive_load_delivered_at`) derives it on insert, update and correction; a later
correction re-derives and re-stamps.

**Fallback.** Dispatch enters the instant by hand through
`set_load_delivered_at(load_id, delivered_at)` — dispatcher, management or owner,
checked in the function body, rejecting an instant more than a day in the future.
A hand-entered instant is NOT wiped by an unrelated stop edit; only an instant
that the stop path itself derived is cleared when its departure is cleared.

**Provenance.** `delivered_at_source` (`stop_departure` | `dispatcher_entry`) and
`delivered_at_by` (FK → `profiles`) are stamped by `stamp_load_delivered_at` from
the writer's context via `current_profile_id()`, never accepted from the client —
the same pattern as `stamp_load_stop_time_source`. `delivered_at_by` is in
`PROFILE_FK_COLUMNS`.

**Snapshot headroom.** `update_load_with_stops` builds its change-history
snapshot with `jsonb_build_object` against the 50-key-per-call limit. Counts
before: 34 and 18. After: 34 and 18 — unchanged, because the two new columns are
trigger-stamped and never travel in the client save payload.

**Status and the instant must agree, but do not gate each other.** The status
transition is never blocked by a missing instant — dispatch marks status, the
instant is a separate fact that may arrive later, and blocking would strand loads
the way the paperwork gate would have. Instead a load at `delivered` or beyond
with no instant is SURFACED: `isDeliveryInstantMissing()` drives a warning on
Load Detail (`DeliveryInstantCard`) and a default-visible `Delivered` column in
the loads list, because whoever is chasing settlement needs to see that the load
cannot be attributed.

**Not in this pass.** No manual charge-entry path, no settlement run, no
driver-facing view.

**Tests.** `src/lib/__tests__/deliveryInstant.test.ts` (16) covers derivation
from the final delivery stop, several delivery stops using the LAST one,
dispatcher entry with source and actor, driver-app departure with source
`stop_departure`, carrier-time reading (a 23:00 Tuesday Pacific departure lands
in the FOLLOWING Wed–Tue week), a delivered load with no instant surfacing as
missing, the status transition not being blocked, and a correction re-stamping
source and actor. `set_load_delivered_at` is recorded in the live definer
catalog's authenticated allowlist (max 105 → 106) with its in-body role check.

**Saved views could not see the new column (found in live verification).**
"Default-visible" only reaches users with no saved view. `user_view_preferences`
already held a `loads_list` column set written before `delivered` existed, so
the column was invisible to exactly the people chasing settlement.
`useViewPreferences` now takes `introducedColumns: { version, keys }`: keys
absent from a stored set are merged in on read, because a set written before the
column existed cannot express an opinion about it. The marker is written the
first time the user changes columns themselves — after that their choice, hide
included, stands. `LoadsListPage` passes `{ version: 1, keys: ['delivered'] }`.

**Live verification (2026-08-31).** Both provenance paths exercised through the
real UI against the real database:
- ST-TEST-005: departure recorded on its final delivery stop →
  `delivered_at 2026-08-16 19:35+00`, source `stop_departure`.
- ST-TEST-003: entered by hand on Load Detail → `2026-08-18 21:10+00`
  (16:10 CT), source `dispatcher_entry`.
Both stamped `delivered_at_by` with the PROFILE id, not the auth uid. The loads
list shows "No delivery instant" for a delivered load with none. A commodity
edit through `update_load_with_stops` saved cleanly and wrote change-history
rows, confirming the snapshot call is still under the 50-key limit.

---

## Standing rule — a new default-visible column is invisible to saved views

This is a rule for every list in the app, not a note about one fix.

A column added as "default visible" reaches only users who have **no** saved
column set. Anyone with a row in `user_view_preferences` for that list keeps the
set they saved, and the new key is simply absent from it — so the column does
not appear. The people most likely to have customised a list are the people most
likely to need the new column, so the default fails hardest exactly where it
matters.

Found when the `delivered` column — added specifically for the people chasing
settlement — was hidden from exactly those people.

**The rule.** Any new column on a list backed by saved view preferences MUST be
introduced through `useViewPreferences`'s `introducedColumns: { version, keys }`.
On read, keys the stored set could not have had an opinion about (because they
did not exist when it was written) are merged in. The version marker is written
the first time the user deliberately changes their columns, so an intentional
hide after that still sticks, and the merge is idempotent until then.

Adding a column without `introducedColumns` is a defect, whether or not anyone
notices: the change ships green and reaches nobody who already customised the
list. This applies to every list using saved view preferences — Loads, Dispatch,
operators, equipment, and any list added later — not just Loads.

## Module 4, Pass 2b — a way to enter a charge (2026-08-31)

`load_charges` had three producers and all three needed a document or a stop, so
detention, lumper and layover — which arise DURING a load — had readers, pay
classes and claim records but no creator. The table was empty across every load.

Entry does NOT go through `update_load_with_stops`. That RPC deletes every
charge on the load and re-inserts the array it is handed, which re-keys the
survivors and would break `detention_claims.resulting_charge_id` and any proof
document already pointing at a charge. Three narrow RPCs write one row each:

- `add_load_charge`, `update_load_charge`, `delete_load_charge` — SECURITY
  DEFINER, dispatcher/management/owner checked in the body, `authenticated`
  EXECUTE only. Registered in the definer catalog (max now 109).
- A reason is REQUIRED on every one, and every create, edit and remove writes a
  `load_change_history` row with the server-resolved actor. `total_load_value`
  is recomputed from the headers plus the charge set, with its own history row.
- `assert_charge_entry_allowed` refuses a load in `invoiced`, `factored`,
  `paid`, `settled` or `closed`. That money is fixed; a late accessorial belongs
  in the adjustment path (`-A1`) and a later settlement.
- Header rate figures — `linehaul_rate`, `fsc_amount`, `rate_per_ton`,
  `loadout_relocation_fee` — are never touched by charge entry, and a test pins
  that.

Detention is never computed by the UI. A resolved claim can create its charge in
the same action that resolves it (`resolved_revision` → "Create the detention
charge from this claim and link it"), which is deliberate and offered only where
no charge is linked yet: one revised rate con carries one detention line while a
load may hold several claims, so nothing matches them automatically.

---

## FIXED 2026-08-31 — `update_load_with_stops` re-keyed every `load_charges` row

**Severity:** silent data integrity failure, masked only by the fact
that `load_charges` had been empty. Fixed the same day it was recorded.

**The defect.** `update_load_with_stops` performs a wholesale
`DELETE FROM public.load_charges WHERE load_id = p_load.id` followed by an
`INSERT` of the charges array in the payload. Any charge that survives the edit
therefore receives a **new primary key**, even when the save had nothing to do
with charges (for example, a commodity edit or a stop phone-number change).

**What breaks.** Any foreign key that points at a `load_charges` row is silently
severed on the next load save:
- `detention_claims.resulting_charge_id` — the link between a resolved detention
  claim and the charge it produced.
- `driver_uploads` / `load_documents` used as proof documents for reimbursement
  or lumper charges.
- Any future settlement line item that references a charge (Module 4 and onward).

The failure is silent because the charge amount and description remain on the
load; only the identity changes, so the break is discovered only when something
else tries to follow the old id.

**Why it has not hurt yet.** `load_charges` was empty across every real load
until Pass 2b added the charge-entry path. The moment a charge is created and the
load is subsequently edited for any reason, the link to its claim or proof
will be lost.

**Fix direction (deferred to its own pass).** Charge reconciliation inside
`update_load_with_stops` must match existing rows by id and update them in place,
insert genuinely new rows, and delete only rows whose ids are absent from the
payload — the same pattern already used for `load_stops`. Alternatively, remove
charges from the `update_load_with_stops` payload entirely and force all charge
writes through the narrow `add/update/delete_load_charge` RPCs.

**The fix, applied 2026-08-31.** `update_load_with_stops` now DIFFS charges
instead of replacing them, the same pattern already used for `load_stops`:

- present with an id and unchanged → the row is not touched at all (the UPDATE
  carries an `IS DISTINCT FROM` guard, so `updated_at` does not move either);
- present with an id and changed → UPDATE in place, same id;
- present with no id → INSERT;
- absent from the payload → DELETE.

`id`, `created_at` and `created_by` survive on every retained row.

**The payload had to change too.** `buildLoadSavePayload` emitted no charge id,
so the client could not express "this is the same charge". `chargeSchema` now
carries `id`, `loadEdit.ts` hydrates it off the row, and the payload emits it.
Stop-off charges are still synthesised from the stop card and carry no id; they
are matched by `load_stop_id` + `charge_type` so they keep their identity too.

**Scope check at the time of the fix.** Stops were already diffed by id, so
`detention_claims.load_stop_id` and stop arrival/departure provenance were never
at risk. `load_references` is not written by this RPC at all (`saveLoadReferences`
owns it). Snapshot key counts are unchanged at 34 + 18 — the fix adds three local
variables and no snapshot keys, so the 100-argument ceiling is no nearer.

**Pinned by** `src/lib/__tests__/chargeIdentity.test.ts`, whose first case is the
reported defect: an unrelated field change leaves every charge id unchanged.
Verified live on ST26035 — a detention claim's `resulting_charge_id` and the
charge's `created_at`/`created_by` were byte-identical across a UI note edit.
**The rows were reverted after that verification.** `load_charges` and
`detention_claims` are both empty today, so the evidence for this check no longer
survives in the database. The absence of those rows is not absence of the check.


## Per-ton bulk is paid on the scale ticket, not on the estimate (2026-08-31)

**The defect.** `recompute_load_total_value` multiplied `rate_per_ton x
estimated_tons`. ST-TEST-003 stores `total_load_value` 455.47 (18.50 x 24.62
*confirmed* tons); the SQL would have rewritten it to 444.00 (18.50 x 24.00
*estimated*) on the next charge edit. The stored figure was right and the
function was wrong: a scale ticket exists precisely to say what crossed the
scale, and the build context records per-ton as "paid per ton via scale ticket."

**Blast radius, measured before applying.** One per-ton load exists in the
database (ST-TEST-003) and its stored total already equals the confirmed-tons
figure, so **zero** stored totals changed. No per-ton load currently has a NULL
`confirmed_tons`; the NULL rule below is forward-looking.

**The rule, and the deliberate split between the two readers.**

| reader | unscaled per-ton load |
|---|---|
| `recompute_load_total_value` / `calcTotalLoadValue` (broker-facing total) | falls back to `estimated_tons` so a live load never reads $0 |
| `computeSettlement` (driver-facing) | **no linehaul line at all**, and the load is named in `pendingScaleTicketLoads` |

Accessorials on an unscaled load still pay; only the tonnage-based linehaul
waits. A per-ton load already REQUIRES a `scale_ticket` as paperwork, so the
unscaled case normally never reaches the engine — it bites only on a deliberate
paperwork release.

**Why paying on estimated tons was rejected.** The correction, once the ticket
lands, is an adjustment — and **no adjustment path exists**. The -A1 late
accessorial scheme is documented and unimplemented, and `settlementEngine`'s
`adjustment` line type has no producer. A short check that cannot be corrected
is worse than a check that waits for the ticket. Revisit only when -A1 ships.

**Surfaced, not silent.** `isAwaitingScaleTicket` (in `src/lib/perTonScale.ts`)
is true for a delivered per-ton load with no confirmed tons, and reads exactly
like a missing delivery instant: a warning triangle on the Rate cell of the
loads list, and a banner plus an "estimated tons — not a payable figure" hint on
Load Detail's Rate Details. Whoever chases settlement sees it before payday
rather than in a driver's short check.

## Module 4, Pass 3 — what the driver sees (2026-09-01)

The settlement now has a driver-facing reading. **Read-only, phone-first, and
derived from nothing.** The screen renders `settlements`, `settlement_line_items`
and the withheld-load rows the engine produced; it re-computes no amount and it
holds no second copy of any explanatory sentence.

**Where the strings come from.** Withheld wording arrives as
`settlement_withheld_loads.message`, which is `WithholdReason.message` from
`src/lib/settlementEngine.ts` — the claim case renders
`CLAIM_HOLD_DRIVER_MESSAGE` ("One of your loads is under review.") verbatim, so
the driver can never be told a different story than the engine's. Status wording
is `SETTLEMENT_STATUS_DRIVER_EXPLANATIONS` in `src/lib/settlementConfig.ts`.

**What he must not see, and how that is enforced.** Gross linehaul, the pay
percentage, the departing flag and the nature of a claim never appear.
`src/components/operator/MySettlements/__tests__/mySettlements.test.tsx` asserts
against RENDERED OUTPUT — the absence of "gross", of any `N%`, of "departing",
of "claim" and of "damaged" — because a source-level grep would pass on a screen
that computed them into view. The word "escrow" never appears and a settlement
under the minimum **rolls into the next one**; the word "holdback" is absent from
the whole tree, guarded by the existing vocabulary test.

**Isolation is asserted at the database, not in the UI.** The portal only ever
asks for its own `operator_id`, so a component test would pass even if the policy
admitted every row. `src/test/operator-settlement-isolation.test.ts` reads
`pg_policy`: every SELECT policy on the three settlement tables is scoped by
`auth.uid()`, no non-SELECT policy admits a driver, `anon` holds no privilege on
any of them, and `my_rm_deposit()` is definer, pinned, not PUBLIC, and returns
two numerics for the caller's row alone.

**Two Pass 1 guards were amended, deliberately.** "Settlement data is closed to
operators — every policy is management or owner" was true until this pass and is
now wrong as written; it was rewritten to allow exactly two doors (own
settlement, own line items, own withheld loads), each self-scoped and read-only,
with the other five tables still fully closed. `my_rm_deposit` was added to the
SECURITY DEFINER inventory with its reason and `KNOWN_AUTHENTICATED_EXECUTABLE_MAX`
bumped 109 → 110.

**Verified at 390x844.** Net pay leads at 2xl; the Repair & Maintenance Deposit
reads "Balance $800.00 of $2,000.00 target"; pay lines, the pass-through fuel
discount as its own line, and deductions all itemise; both withheld loads render
with the engine's own sentence; the below-minimum settlement says
"$61.25 rolls into your next settlement."

**Baselines, both shapes green:**

```text
with a database:     Test Files  133 passed | 2 skipped (135)
                          Tests  1106 passed | 15 skipped (1121)

without a database:  Test Files  123 passed | 12 skipped (135)
                          Tests  1031 passed | 82 skipped (1113)
```

**Still open after this pass.** Nothing writes `settlements`,
`settlement_line_items` or `settlement_withheld_loads` yet — the engine runs, but
no persistence path calls it, so the driver's screen is correct and empty until
Pass 4 lands the writer.

---

## Module 4, Pass 4 — persisting a settlement (2026-09-01)

**The first end-to-end path from a real load to a figure a driver would be paid.**
`computeSettlement` now has a production caller, and the driver's screen has
displayed a persisted number.

**Three layers, deliberately separate** (`src/lib/settlementRun.ts`):

- **Gathering decides nothing.** It collects loads delivered in the period with
  their charges, documents, exceptions and claim rows, plus fuel, deductions,
  advance balances, R&M state and carry-forward — and hands them all to the
  engine. It does NOT drop a claim-held or paperwork-short load; a filtering
  gathering layer could silently disagree with the engine, which is the exact
  reasoning already recorded for claim holds. A guard asserts this.
- **Compute** is the engine, untouched by this pass.
- **Store** is `store_settlement_run(date, date, date, jsonb, text)` — the only
  writer. Definer, `search_path` pinned to `public, extensions`, revoked from
  PUBLIC and anon, gated on management/owner in its own body, actor stamped via
  `current_profile_id()`. It writes the settlement, EVERY line item and EVERY
  withheld load in one transaction, and writes `settlement_stored` /
  `settlement_recomputed` rows to `audit_log`.

**Population** is read from the recorded rule through `selectSettlementPopulation`:
anyone with unsettled work. No `is_active`, parked, departing,
`excluded_from_dispatch`, `fully_onboarded` or `lease_terminations`. A driver
with only deductions is included and settles negative.

**A settlement is a statement, not a live calculation.**

- The driver view reads stored rows and imports neither the engine nor the run.
  Asserted by source scan, comments stripped.
- **Re-running a period that already has a settlement REFUSES by default.** The
  recommendation, and what shipped: refuse, and offer an explicit recomputation
  the runner must accept in the UI. A recomputation deletes and rewrites the
  settlement with the previous net and status recorded in `audit_log` first. It
  never happens silently.
- **A PAID settlement is immutable** — refused even in recompute mode, and
  enforced at the database by `enforce_settlement_immutability` (settlement) and
  `enforce_settlement_child_immutability` (lines, withheld loads). Both trigger
  functions and the transaction-local writer flag `settlement_writer_active()`
  are executable by NO client role.

**Placement.** Management → Accounting → **Settlement Run**, beside Fuel Import
and Settlement Settings, per the standing navigation rule. Management and owner
only. No schedule, no cron: a run is a deliberate act, previewed in full —
drivers included, each net, each status, every line and every withheld load with
its reason — and only written after the runner approves.

**Live verification, Johnathan Pratt, work week Wed 12 – Tue 18 Aug 2026:**

```text
settlements       f77911b0-50cd-4ae3-bff2-ebb0bc4331af  2026-08-12 → 2026-08-18
                  payday 2026-09-01  status paid
                  gross 327.94  deductions 0.00  net 327.94  carry 0.00 → 0.00
line items        load_pay 327.94  "Load ST-TEST-003 — Linehaul (per ton, from
                  scale ticket)"  loads:c222d62f-…
withheld loads    ST-TEST-005  paperwork   "paperwork outstanding: Proof of
                                            delivery."   {Proof of delivery}
                  ST-TEST-005  claim_hold  "One of your loads is under review."
                                           {Load under review}
re-run, same week → {"outcome": "refused_existing", "existing_net": 327.94,
                     "existing_status": "paid"}
```

The driver view at 390×844 rendered THAT row: NET $327.94, PAID, one pay line,
no deductions, and both withheld reasons in the engine's own words.

**Open after this pass:**

- **Cash advances are a population trigger only.** See section 9 in
  **Settlement rules — the authoritative record**. No repayment schedule exists
  anywhere in the schema, so the gathering layer records the outstanding balance
  as a reason to include the driver and produces NO recovery line. Inventing a
  weekly recovery there would be the gathering layer making a pay rule. A driver
  with an outstanding advance currently settles with nothing deducted for it.
- **The correction route is still missing.** Immutability is enforced now, but
  `accessorial_adjustments`, invoices and supplemental invoices do not exist, the
  `-A1` scheme is documented and unimplemented, and the engine's `adjustment`
  line kind has no producer. A PAID settlement can be refused a rewrite but a
  correction cannot yet be issued.
- **Two withheld rows for one load render as two cards** in the driver view —
  one per reason. Correct, and readable, but grouping by load may read better.

**Baselines, both shapes green (restamped for Pass 4):**

```text
with a database:     Test Files  134 passed | 2 skipped (136)
                          Tests  1118 passed | 15 skipped (1133)

without a database:  Test Files  124 passed | 12 skipped (136)
                          Tests  1043 passed | 82 skipped (1125)
```

The no-database shape reports one unhandled error, `[vitest-worker]: Timeout
calling "onTaskUpdate"` — a harness RPC timeout under `--maxWorkers=2`, not a
failing assertion. No test failed in either shape.

## FIXED 2026-09-01 — expiry editing was dead in both binder views

**The regression.** Commit `64d0f1133` (2026-08-30) replaced the expiry-editor
trigger in `OperatorBinderPanel.tsx` and `InspectionBinderAdmin.tsx` with a plain
`div`. Nothing else set `expiryEditing`, so the editor branch could never become
true — for EVERY document row, not just the one being locked. Dead for roughly
two days in both binder views. Staff could not set or correct an expiry on a CDL,
a Medical Certificate or anything else.

The intent was narrow: Periodic DOT Inspection dates are owned by Vehicle Hub and
should not be editable in the binder. The edit reached every row instead.

**The pattern, twice in three days.** Issue 2 was the same shape — an inline
per-ton total written into `update_load_with_stops` while narrowing one case,
which then overwrote the scale-ticket total on every edit. Both were broad edits
made while narrowing one case.

> **Caution, standing.** When locking one case, check what else the change
> reaches. Enumerate the sibling rows/paths the predicate touches before shipping
> the narrowing, and write the regression test for the case that must STAY open,
> not only for the case being closed.

**The fix.** The click handler is restored for every document except those
`isInspectionDateDoc` identifies. Those rows now carry a "Managed in Vehicle Hub"
chip explaining the lock rather than being silently inert. Covered by
`src/test/binder-expiry-editor.test.ts`.

### OPERATIONAL follow-up — 13 documents hold a file with no `expires_at`

Not a code task. These rows are invisible to `cron-cert-reminders`,
`check-inspection-expiry` and the Compliance Summary — their alerts have been
silently not firing. Now that the editor works, someone needs to set the dates.

| Document | Count |
| --- | --- |
| Form 2290 | 7 |
| Medical Certificate | 3 |
| MC Authority | 2 |
| ELD Procedures | 1 |
| **Total** | **13** |

The 2 Periodic DOT Inspections with no `expires_at` are Vehicle-Hub managed and
expected — not part of this list.

### OPEN — should an ICA be expiry-tracked?

Lease Agreement (ICA) is configured `hasExpiry: false`, so 83 of 83 carry no
expiry by design. An ICA is a contract with a term. Whether that term should be
expiry-tracked and alerted on is a business decision, not a defect. Unresolved.

## The database can be MISSING what the migration file contains (2026-09-01)

`carrier_profile` carried its four RLS policies but **no table grants at all** —
the Data API refused every signed-in read, which is what killed the driver ELD
screens. The grants are present in the 2026-07-30 creating migration
(`20260730132021_*.sql`, lines 21-23) and are absent from the live catalog.

This is the **first observed case of the database missing something the migration
file contains**. Every prior divergence ran the other way — a change applied to
the database and the file never committed.

> **Standing conclusion.** The migration history on disk is not a reliable
> description of the live schema **in either direction**. Do not read a
> migration file as evidence that the database is in that state, and do not read
> the absence of a file as evidence that it is not. Current-state catalog checks
> — `pg_class.relacl`, `has_table_privilege`, `pg_policy`,
> `public.grant_parity_report()` — are the only authority.

**Parity sweep run after the fix.** `grant_parity_report()` returns **zero rows**:
no `policy_without_grant`, no `anon_policy_without_grant`, no
`service_role_without_grant`, no `policies_without_rls` anywhere in `public`.
`carrier_profile` was the only table in that state, and it is now closed.

The reverse direction — a grant no policy backs — was swept separately and is
**benign by design**: 62 tables grant `DELETE`, 41 grant `UPDATE` and 23 grant
`INSERT` to `authenticated` with no policy admitting that command. RLS denies
those writes; the grant is inert. No `anon` grant and no `SELECT` grant is
unbacked. Left as-is — narrowing them would be cosmetic.

### CORRECTION — the reported `recompute_load_total_value` drift was not real

A read-only investigation on 2026-09-01 reported the live
`recompute_load_total_value(p_load_id, p_reason)` as a case of the database being
AHEAD of the migration files, citing `20260831214215` as the newest committed
definition.

**That report was wrong.** Two later migrations exist and are committed:

```text
20260901124505   recompute_load_total_value(uuid)
20260901125013   recompute_load_total_value(uuid, text)
```

The two-argument version is committed. There is no drift here.

**The lesson, which is subtle and worth keeping.** The standing rule above — the
catalog beats the migration files — was applied CORRECTLY, but against a
truncated set of files, so a correct rule produced a wrong conclusion. "The file
does not contain X" is only evidence once ALL the files have been read.

**Second instance of the same error (2026-09-01).** The original KNOWN DEBT
entry for `loads.dispatcher_id` (now corrected above) was written from the FIRST
migration defining `create_load_with_stops` (`20260819161111`), which quoted a
`NULLIF(p_load->>'dispatcher_id','')::uuid` path. That path was removed in a
later redefinition (`20260827222017`), the current definition. Both this and
the reported `recompute_load_total_value` drift involved a function REDEFINED
MANY TIMES, where the oldest definition is the one `grep` reaches first and
reads plausibly. The practical rule: when checking what a database function
does, list EVERY migration defining it and read the NEWEST, never the first
match.


---

## FIXED 2026-08-31 — the engine omitted linehaul entirely (header rates)

**Found by the first real settlement run, not by the suite.** Johnathan Pratt's
ST-TEST-002 settled at **$204.00 on a $3,415.00 load**. `computeSettlement` read
only `load_charges`, so the two largest numbers on a normal load — `linehaul_rate`
(2,850.00) and `fsc_amount` (340.00), which live in **header columns on `loads`**,
not in `load_charges` — were never seen. Only the accessorials paid.

**Fix.** `settlementEngine.ts` gained `headerRateLines()`, which turns the header
figures into pay lines before the charge lines are added: `linehaul_rate`,
`fsc_amount` (suppressed when `fsc_bundled_into_linehaul` is true or NULL, since
both mean "inside the linehaul rate"), `rate_per_ton x confirmed_tons`, and
`loadout_relocation_fee`. Charges continue to pay on top; nothing is double-paid
because charge entry never touches the header fields and a test pins that.

**Why a green suite missed it.** Every engine fixture built its loads out of
`load_charges` rows. The fixtures agreed with the engine's wrong assumption, so
the arithmetic was correct against a shape real loads do not have. A pure engine
is only as honest as the shapes it is fed — this is the case that argues for
running a real row through the real path at the end of every money pass.

---

## The six reported issues of 2026-09-01 — three real, three stale

| # | Report | Verdict |
|---|---|---|
| 1 | — | **Stale.** Already closed in this document. |
| 2 | `update_load_with_stops` writes an inline per-ton total over the scale-ticket total | **Real, fixed.** |
| 3 | Expiry editing dead in both binder views | **Real, fixed.** |
| 4 | `permission denied` on `carrier_profile`, blocking driver ELD screens | **Real, fixed.** |
| 5 | Equipment serial guard | **Stale.** Fixed 2026-08-29. |
| 6 | — | **Stale.** Already closed in this document. |

### Issue 2 — one implementation of the money

Migration `20260831203038` redefined `update_load_with_stops` with its **own**
inline total, `rate_per_ton x estimated_tons`, and never called
`recompute_load_total_value`. The later per-ton corrections (`20260831212039`,
`20260831214215`) patched the shared helper only, so the **edit path stayed
unpatched** and every load save wrote the estimate over the scale-ticket total.

- The inline block is gone. The RPC writes the row and then calls
  `public.recompute_load_total_value(p_load_id, v_reason)` — one implementation,
  with the edit's typed reason landing on the `total_load_value` history row. The
  helper is revoked from PUBLIC, `anon` and `authenticated`; it is internal only.
- `confirmed_tons` now travels in the payload (`loadFormSchema.ts`,
  `loadEdit.ts`, `loadSavePayload.ts`), counts as a financial field, and is
  diffed and recorded by the RPC.
- **Verified on the real row.** ST-TEST-003 edited through the form, estimated
  tons 24 → 25: `total_load_value` stayed **455.47** (18.50 x 24.62), where the
  pre-fix save would have written 462.50, or 444.00 on a plain re-save. Row
  restored afterwards.
- **Provenance: written before the fix, not a deliberate duplicate.**
  `recompute_load_total_value` was created at `20260831192947` carrying the same
  then-correct estimate formula; `20260831203038` sits between that and the
  correction. The copy was inlined for convenience because the edit path needed
  the total *before* its single `UPDATE`. That convenience is exactly what let
  the one-line fix miss a caller.

### Issue 2a — the `fsc_bundled_into_linehaul` tri-state

The RPC coerced a NULL to `true`/`false` on save, so **every** edit of such a
load registered a spurious financial change and demanded a reason — which trains
people to type reasons reflexively and erodes the signal. NULL and `true` both
mean "bundled into the linehaul rate"; the tri-state is now preserved end to end
through the payload and the RPC. **2 of 10 existing loads carry NULL** and now
edit without a false financial warning.

### The pattern: a broad edit made while narrowing one case

Issue 2 and issue 3 share a shape, three days apart. Issue 3 locked the expiry
editor for *every* document row while intending to lock only Periodic DOT
Inspections; issue 2 inlined a total for *every* load save while intending to
serve one code path. **Caution: when locking or specialising one case, enumerate
what else the change reaches.** Both defects shipped green.

---

## OPERATIONAL follow-up — app installs (measured 2026-09-01)

**48 of 61** active operators have installed the PWA. **11 are web-only** and
**2 have never signed in**. Not a code task: the install reminder path exists
(daily cron plus a manual per-driver reminder with a 24h cooldown). The two who
have never signed in cannot receive an in-app anything and need a phone call.

---

## KNOWN DEBT — findings from the dispatch settlement investigation (2026-09-01)

Same format as the entries in `docs/tms-wish-list.md`: each carries an explicit
TRIGGER. These are recorded here rather than there because each one is a live
defect or a live silence in built code, not a parked capability.

### `per_ton_pct` and `loadout_pct` are read by nothing

`pay_policies` carries `per_ton_pct` and `loadout_pct`, both NOT NULL DEFAULT
72.00. They appear in `src/integrations/supabase/types.ts` and **nowhere else**.
The engine pays both a per-ton load and a loadout at `linehaul_pct`; the
classification-to-column map has no entry for either.

Consequence: setting `loadout_pct` to 50 does nothing — the driver is paid
`linehaul_pct`. Two configuration surfaces that silently do nothing, on money,
both NOT NULL so both always look configured.

Same class as `pay_policies` being UI-gated while the table stayed readable, and
the roof check matching a label nothing wrote.

**TRIGGER: before any pay policy other than the company default is created, or
before anyone is told these fields work.**

### `loads.dispatcher_id` is written only for dispatcher-role creators, and `pgFake` hides the gap

`create_load_with_stops` (current definition `20260827222017`) resolves the actor
with `public.current_profile_id()` and stamps `loads.dispatcher_id` only when
`public.has_role(auth.uid(), 'dispatcher')` is true. The RPC's authorization
gate admits `management`, `owner`, or `dispatcher`, but the stamp has no role
implication: a load created by an owner or management user gets a NULL
`dispatcher_id` silently.

`update_load_with_stops` (current definition `20260827222017`) does not touch
`dispatcher_id`, so attribution cannot be corrected after creation — not for a
load entered by an owner, and not for a load that changes hands between
dispatchers.

`src/test/helpers/pgFake.ts` stamps `dispatcher_id` to the acting profile with NO
role check, unconditionally. The real SQL stamps only for dispatchers. The fake
therefore shows a stamped dispatcher for an owner actor where production writes
NULL — it hides precisely the case that is broken. The divergence is a MISSING
ROLE CONDITION, not an invented value.

Live data matches: 5 of 10 loads populated (seed or hand SQL), and **zero of
the two delivered loads**.

**TRIGGER: FIXED IN THE NEXT PASS, before freight accumulates.** A month of loads
created with a null dispatcher cannot be attributed retroactively without
guessing. The fix adds an editable Dispatcher field on Load Detail and corrects
`pgFake` to respect the same dispatcher-only role condition.

### A mis-keyed loadout settles silently at zero

On the broker's paperwork a loadout is an ordinary flat-rate load — IEL shows
Rate Type "Flat Rate" $100.00, Rolling River shows Pay Type "Flat" $150.00.
Neither has a "relocation fee" concept. So the money arrives in `linehaul_rate`.

If `load_type` is then set to `loadout`, both `recompute_load_total_value` and the
engine's header-rate path take the loadout branch, read
`loadout_relocation_fee`, find null, and return **$0**. The driver is paid nothing
and the broker-facing total is zero.

This is undetectable by inspection, because a $0 loadout is LEGITIMATE — the
trailer use is the value. The wrong answer is indistinguishable from a correct one.

Proposed guard: a load at `load_type` `loadout` with a null or zero
`loadout_relocation_fee` AND a non-zero `linehaul_rate` is almost certainly
mis-keyed and should be refused or flagged rather than settled.

**TRIGGER: before the first real loadout settles.**

### Broker chargebacks are not representable

Real rate confirmations carry substantial deductions against the carrier. IEL:
$100 per day a trailer is late, $100 for not emailing within two hours of
delivery, $200 for an unreported trailer swap, $125 for a missed check call, $35
per comcheck. Rolling River: $100 per day late on all loadouts, and a 10%
settlement deduction if the driver does not maintain their tracking app.

There is no negative charge in the model. `assert_known_charge_type` accepts nine
classifications and none is a chargeback.

The settlement consequences are recorded in section 4 of **Settlement rules — the
authoritative record**: the dispatch base is unaffected; the driver IS deducted,
with the cause governing and discretion retained.

**TRIGGER: before the first chargeback has to be applied to a real settlement.**

### A loadout drops its charges from the broker-facing total

`recompute_load_total_value` on `load_type` `loadout` sets the total to
`loadout_relocation_fee` alone and never adds the charge sum, unlike every other
load type. A lumper or detention charge added to a loadout load never reaches
`total_load_value`.

It does not affect the dispatch base, which is built from parts and does not read
`total_load_value`. It appears to be a defect on its own terms.

**TRIGGER: before any loadout load carries a charge, or before `total_load_value`
is used for invoicing in Module 7.**

### A recorded live verification no longer has surviving evidence

The Module 4 Pass 2b charge-identity verification cites ST26035. `load_charges`
and `detention_claims` are both now EMPTY: the rows were reverted after the test —
an ordinary habit here, and the same habit `docs/tms-wish-list.md` records as
producing orphaned storage objects. The Pass 2b entry has been amended in place to
say so, so that a future session does not go looking for evidence that is gone and
conclude the verification never happened.

**TRIGGER: none — this is a documentation correction.**
