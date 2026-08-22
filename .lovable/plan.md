# Revised rate confirmation — verbatim capture, accept defaults, reference diffing

Approved scope: items 1–3 plus reference diffing build now. The reimbursement pay class is specified below but **not built** pending the funding-source decision.

Answers to the five additions come first, because two of them change what gets built.

---

## A. Golden-text assertion (addition 1)

Agreed — the zero-change test only proves stability. Both tests ship:

- **Fidelity:** a checked-in Blue Grace fixture (`src/lib/__tests__/fixtures/bluegrace-BG969676425.*`) holding the exact printed strings. Assert `special_instructions_verbatim`, `broker_terms_verbatim` and each stop's `notes_verbatim` equal those strings byte for byte, including `(800) 697-4477`, `CALAVO@BLUEGRACEGROUP.COM` and `ALL ORDER#S MUST BE USED TO CAN GET NEED TIH.`
- **Stability:** re-parse the unmodified fixture through `buildRevisionDiff` against the load built from it and assert zero changes.

The fidelity fixture is the parser's expected output, so the assertion runs against the normalizer without an API call; the live model path stays covered by the stability test.

## B. Text-layer verification — yes, it is possible (addition 2)

The pipeline is not image-only. The client sends the raw file as base64 (`file_base64` + `mime_type`) and the edge function forwards it to the gateway as a document part. The full PDF bytes are therefore in hand at parse time, and `pdfjs-dist` is already a project dependency used by `src/lib/pdfToImages.ts`.

Design:

- The client extracts the text layer with the pdfjs it already loads and sends it as `text_layer` alongside the file. Doing it client-side reuses the existing worker rather than adding a PDF library to the Deno runtime.
- After extraction, each verbatim string is checked for presence in that text layer with whitespace, casing and soft-hyphen differences collapsed.
- A string that does not appear is **not silently stored**: it comes back with `verbatim_verified: false` and a reason, the review screen marks the field "could not be verified against the document", and it defaults to unchecked in any diff.
- Two cases have no text layer at all — an uploaded image, and a scanned PDF whose pages carry no text. Those report `verbatim_verified: null` ("not verifiable — no text layer") rather than false. Not verified is stated, never faked.

## C. Reference label class map (addition 3)

Explicit class map, applied to the printed label after lowercasing and stripping `#`, `no.`, `number`, punctuation and whitespace:

| Class | Labels mapped |
| --- | --- |
| `bol` | bol, bl, b/l, bill of lading, bol number |
| `pro` | pro, pro number, pronumber, pro# |
| `pickup` | pu, pu#, pickup, pickup number, pick up number, pickup ref, shipment pickup |
| `delivery` | del, dl, delivery, delivery number, drop number |
| `po` | po, po number, purchase order |
| `order` | order, order number, load, load number, load id, shipment, shipment number, so, si, lo, ref, reference |
| `seal` | seal, seal number |
| `appointment` | appt, appointment, confirmation, conf, appointment number |
| `mode` | mode |

`PU# IX00286060` in Stop 1's comment and `Pickup Number IX00286060` in the References table both normalize to `pickup`, so they collapse to one row and the revised document does not surface a phantom new pickup number.

**Unseen labels:** a label that matches no class does **not** become its own class from its raw string. It resolves to class `unclassified` and carries its printed label. Every `unclassified` reference is logged with its label and value in the function's parse log so a genuinely new broker label shows up and can be added to the map. Dedup for `unclassified` falls back to the current value-only behaviour, which is the conservative side — worst case an unmapped label collapses with a same-valued sibling, exactly today's behaviour, and the log says it happened.

## D. The multi-stop heuristic (addition 4)

What it was protecting against: brokers printing an internal routing or account code identically in every stop block — the prompt's own framing, "the same value appears on more than one stop… almost certainly an internal broker code." Warehouse door and lot codes are the same shape.

It is already narrower than it looks: any label matching the shipment/order whitelist (`SO SI PRO ORDER SHIPMENT BOL PO PU PICKUP DELIVERY DL RELEASE SEAL APPT CONFIRMATION`) is exempted and kept. What it actually drops today is a repeated value under an **opaque or unlabelled** code.

Change: re-key that pass on class + value and let the whitelist become the class map — a repeat under a mapped class is kept on every stop it appears on, since a shipment number printed at both the pickup and the delivery is exactly what a guard asks for. Only `unclassified` repeats are dropped, and each drop is logged.

There is a **third** pass that also has to change, and it is the one that actually killed the PRO row: a near-duplicate collapse keyed on `refCore(value)` — the value stripped of leading and trailing letters — which merges two references sharing a core number and keeps the "more explicit" label. PRO `BG969676425` and BOL `BG969676425` share a core and get collapsed. Plus the load-level pass drops any stop reference whose normalized value matches the load's BOL/PO/broker load number, which removes PRO a second time. Both get re-keyed on class + value: same class, same value collapses; different classes with the same value both survive.

## E. Retention and backfill (addition 5)

Both checked in the code:

- **Original rate confirmation: retained.** `CreateLoadPage` uploads the parsed source file as a `rate_confirmation` `load_documents` row when the load saves. A backfill of verbatim text from stored PDFs is therefore possible later. Low-priority cleanup, not built now. Until then, pre-change loads hold a paraphrase and will diff against their own document on re-parse; the review screen will label a field whose stored value predates verbatim capture as "stored before verbatim capture — compare manually" so the dispatcher is not told the broker changed something they did not.
- **Revised document on cancel: NOT retained today.** `RevisedRateConModal` uploads the `revised_rate_confirmation` only inside the apply path, after `updateLoadWithStops` succeeds. Cancelling calls `reset()`, which clears the file, and it is never written. **This is in scope and gets fixed:** the revised file uploads on selection, once the document-identity check passes, so it is on the load whether or not the dispatcher applies anything. When the review is cancelled the document stays with a note recording that it was reviewed and not applied. Both files are retained regardless of which supersedes the other, which is the only way to tell them apart on a broker that stamps no revision marker.

---

## What gets built

### 1. Verbatim capture

Extraction contract gains, alongside the existing condensed field:

- `special_instructions_verbatim` — the printed Special Instructions / Comments block only.
- `broker_terms_verbatim` — the terms/agreement paragraph, a separate field, never concatenated with the above.
- per stop `notes_verbatim` — the stop's comment field as printed.

Prompt rule for all three: transcribe exactly as printed — same wording, order, line breaks, casing and punctuation. Never summarize, reorder, or drop a phone number, email address or sentence. Absent block returns null, not an empty summary. Each carries its own `verbatim_verified` result from section B.

Stored values on `loads` and `load_stops` are the verbatim strings. The condensed one-line-per-term view stays, derived at render time by a `condenseInstructions` helper — never the stored value.

### 2. Accept defaults

Non-financial diff rows get a `freeText` flag. Free-text rows — special instructions, broker terms, stop notes, descriptions, and any field flagged unverified — default **unchecked** and are labelled as needing a read. Structured rows — dates, times, numbers, addresses, city/state/ZIP, contact, equipment, commodity, references — keep default-accept, still forced unchecked when the stop carries driver check-in data.

### 3. Reference diffing

References are diffed as a set per stop, not through the single `pickReference` winner. Added, removed and changed references each surface as their own non-financial change showing the printed label and value. The primary gate reference the stop form displays is still chosen by `pickReference`. Combined with the class-keyed dedup above, the added `PRO BG969676425` appears as one new reference and the pickup number does not appear at all.

### 4. Reimbursement pay class — specified, NOT built

Current classifications and their treatment under the active company policy ("SUPERTRANSPORT Standard"): linehaul 72%, fuel surcharge 72%, detention 100%, layover 100%, stop-off 72%, TONU 72%, lumper 100% (`lumper_reimbursement_pct`), **other 72%** (`other_accessorial_pct`). `other` is the dropdown default, so a driver-funded washout defaults to a 72% payout on money he fronted in full.

Specified design, held until the funding-source question is resolved: every charge type carries a pay class — `revenue` (split at the policy percentage) or `reimbursement` (passes through whole, excluded from the revenue split). Lumper's 100% comes from the class rather than a bespoke column. Nothing in this section is implemented in this pass; the dropdown and pay math are untouched.

---

## Tests

- Golden text: verbatim fields equal the checked-in Blue Grace strings exactly.
- Stability: re-parsing the unmodified fixture produces zero diff rows.
- Verification: a verbatim string absent from the text layer is flagged, not stored silently; an image upload reports not-verifiable rather than false.
- Label classes: `PU#` and `Pickup Number` resolve to one class; `PRO` and `BOL` sharing a value both survive; an unmapped label lands in `unclassified` and is logged.
- Reference diff: the added PRO row appears as a non-financial change; a removed reference appears as a removal.
- Defaults: free-text rows unchecked, structured rows checked.
- Retention: cancelling the revision review leaves the revised document attached to the load.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts` — verbatim fields in the JSON contract and prompt; `text_layer` verification; reference class map replacing the three raw-value dedup passes; `unclassified` logging.
- `src/lib/pdfToText.ts` (new) — text-layer extraction via the existing `pdfjs-dist`, returning null for image/scan input.
- `src/lib/rateConfirmation.ts` — extended `ParsedRateConfirmation` / `ParsedStop`, reference class type, `condenseInstructions`.
- `src/lib/revisedRateCon.ts` — `freeText` flag driving `defaultAccept`; reference-set diffing.
- `src/components/dispatch/loadDetail/RevisedRateConModal.tsx` — upload the revised document on selection rather than on apply.
- Migration: verbatim text columns on `loads` and `load_stops`, and a per-stop reference table or JSON column to hold the full reference set. No RLS change — existing table policies cover new columns.
