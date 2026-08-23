# Close the three path-coverage gaps

## First, the confirmation you asked for on unclassified reference labels

Worse than in-memory. `classifyReferences` returns a `dropped` array for categorical
rows it routes out of references, and **no caller reads it** — not the create path,
not the revision path, not a log line despite the comment in `referenceClasses.ts`
claiming one. There is no in-memory log to persist; the rows are discarded at the
call site. Separately, a printed label the map does not know does not announce
itself at all: it silently becomes class `other` and is stored as a reference, so a
broker printing an unfamiliar label looks like a successful parse. Both get logged
by this work.

## 0. The `unclassified` class — specified, never built (do this first)

Confirmed by search: `unclassified` appears nowhere in `src/`. The only trace is the
parser's `drop('unclassified label')` for categorical rows and a comment in
`verbatimRegions.ts` referring to a pattern that does not exist. It was specified and
never built, and you are right that logging alone does not close it — today
`classifyReferenceLabel` returns `'other'` both for "no printed label" and for "label
the map does not know", and `other` is a real identifying class that dedups on
`(class, value)` alongside genuine order numbers.

Build it:

- New class `unclassified` in `ReferenceClass` and `REFERENCE_CLASSES`:
  `identifying: true`, display label taken from the **printed label**, not a fixed one.
- `classifyReferenceLabel` returns `unclassified` for a label the map and the prefix
  fallback both miss. An **absent** label still returns `other` — that is a genuinely
  unlabelled reference, a different thing from an unrecognised one.
- Dedup falls back to value-only: `unclassified` rows key on the value alone, so two
  differently-printed unknown labels carrying the same number collapse, and an unknown
  label never collides with or masquerades as a recognised class. No schema change —
  `load_references.reference_class` is text and the unique key is
  `(load_id, reference_class, value_key)`, so a constant `unclassified` class already
  gives value-only dedup within the class and isolation from every other class.
- Visibly distinct everywhere references render — the revision review rows, the new
  Load Detail references card, and the reference chips on the create form: shown as
  the printed label with an "unrecognised label" marker, so a dispatcher can tell
  "this is a PO number" from "this is something printed as XYZ Ref that the parser
  did not recognise".
- Every `unclassified` resolution also writes a `reference_label_unrecognized`
  diagnostic row (label only, never the value), so the three unfamiliar brokers you
  are about to run leave a readable trail of the labels to teach the map.

## 1. Persist the anchor miss log (and the reference-label misses)

**New table `parser_diagnostics`**, one row per thing the parser failed to recognise:

- `kind` — `anchor_miss`, `reference_label_unrecognized`, or `reference_row_dropped`
- `field`, `failure`, `occurrences`, `stop_number` (anchor misses)
- `headings text[]`, `ordering jsonb` — the document's heading-shaped lines, which is
  the payload you actually need to grow the anchor set
- `label`, `reference_class` (reference misses; the label only, never the value —
  the log must not become a second copy of broker-authored identifiers)
- `load_id`, `load_number`, `document_id`, `document_label`, `parser_contract`
- `resolved_at` / `resolved_by`, so a heading you have since taught the parser stops
  showing up as open
- Staff-only RLS (dispatcher/management/owner/onboarding read and insert;
  dispatcher/management/owner resolve). Operators have no access.

**New `src/lib/parserDiagnostics.ts`** — drains `anchorMisses()` after a parse,
collects unrecognised and dropped reference labels from the same parse, and inserts
them with the document and load context. A failure to log never interrupts a parse.

**Wired on both paths**, which is the whole point of the exercise: the create form's
parser (load id unknown, so `document_label` = file name, backfilled on save) and the
revision modal (load id known). `classifyReferences` gains an `unrecognized` array so
label misses are reportable at all.

**Read view** — `Parser Diagnostics` under Tools in the dispatch sidebar at
`/dispatch/parser-diagnostics`: grouped by kind, newest first, showing the failure,
the field, the document, the load, the timestamp, the heading lines on expand, and a
"mark resolved" action. Survives reload, which the array did not.

## 2. Read the verification record and the references back on Load Detail

**New `VerificationCard`** on the load detail page, staff-only, reading
`loads.verbatim_verification`:

- Nothing shown when every stored verdict is `verified` — a clean load stays quiet.
- Any other verdict lists the field, the verdict in plain language, and on expand the
  artifact list (kind, the literal characters, the surrounding words), the similarity,
  the missing tokens, and the anchor or region failure.
- A `manual_repair` span is marked as repaired with **who and when**. That attribution
  does not exist today, so `set_load_verbatim_verification` is changed to stamp
  `repaired_by` / `repaired_at` server-side onto `manual_repair` records — the browser
  is not trusted to say who did the repair.

**New `ReferencesCard`** — the load's `load_references` rows via the existing
`fetchLoadReferences`, each with its class, printed label, value, and the stop
citations with the label as that stop printed it. A filed baseline becomes visible on
the load instead of only inferable from a review screen showing no changes.

## 3. Duplicate broker-reference detection on the revision path

`checkForDuplicateBrokerReference` already accepts `excludeLoadId`, so the revision
path runs the same check with the load itself excluded:

- Fires when the parsed document's broker reference differs from the load's, at the
  identity step, and again as a backstop before Apply.
- Same `DuplicateBrokerRefDialog`, same warn-never-block behaviour, with the wording
  adjusted for "apply anyway" rather than "create anyway".
- Proceeding writes the same paired change-history entries through
  `record_duplicate_broker_reference`, so both loads carry the record.

## Documentation

`docs/tms-build-status.md` gains:

- **Known revision-path gaps (deferred)** — facility directory matching on an added
  stop, broker address prefill and provenance, broker candidate matching/creation.
- **Standing rule** — every check must be verified reachable from both the create and
  the revision path, not assumed. Names the three found tonight (`saveLoadReferences`
  with no caller, verification absent from the revision path, a log nothing read) and
  the reason the suite missed them: unit tests call the functions directly, so a
  function with no invocation still passes.

## Technical notes

- One migration: the `parser_diagnostics` table with grants and RLS, plus the
  `set_load_verbatim_verification` change for repair attribution.
- **Wiring test — structural, not a fixed list.** It is practical, so that is what I
  will build. Each check function carries a `@parser-check` JSDoc tag. The test reads
  the source tree, discovers every tagged export (so the set is whatever the code
  says, not what the test remembers), then walks the import graph from both entry
  points — the create parser and the revision modal — and fails naming any tagged
  check with no call site on either path. Adding a new tagged check without wiring it
  fails immediately; that is the fourth instance caught before it ships. The fixed
  list is not used.
- Plus unit tests for `unclassified` resolution and its value-only dedup, diagnostics
  collection, and duplicate detection excluding the load being revised.
- No change to parser behaviour, verdict ranking, or the diff engine.

Approve and I will build these in the order listed, with the read-side landing before
anything else that would make you wait on it.
