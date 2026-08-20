# AI Rate Confirmation Parsing for Create Load

Dispatcher uploads a broker rate confirmation PDF, the system extracts the load data, and the existing Create Load form opens pre-filled for review. Nothing is written to the database until the dispatcher saves the load.

## 1. Stop reference numbers (schema)

Add two nullable text columns to `load_stops`: `reference_number` and `reference_label` (what the broker called it — "Pickup #", "PU#", "Delivery #").

- Create Load form: an optional label + number pair on each stop card in `StopsSection.tsx`.
- Load Detail: shown prominently on each stop in `StopsTimeline.tsx` — a bordered gold-accented chip reading e.g. `Pickup # 4471902`, so a driver at a guard shack finds it instantly.

No other schema changes. `loads` and the existing save logic are untouched.

## 2. Parse action and progress

A "Parse Rate Confirmation" card sits at the very top of the Create Load page: drop zone / file picker for a PDF, then a staged progress state (Uploading → Reading document → Extracting fields), since a multi-page rate con takes several seconds. The rest of the form stays usable throughout, and manual entry is always available.

## 3. Extraction (Edge Function)

New edge function `parse-rate-confirmation`, following the existing `parse-maintenance-invoice` pattern: staff-role check via `getClaims`, PDF sent to the built-in AI gateway as a document part (layout and table structure are preserved — no client-side text extraction). The AI key never reaches the browser.

It returns a JSON object where every field carries a value plus a `high | medium | low` confidence, covering:

- Broker: company name, MC number, agent/contact name, phone, email
- Load ids: broker's own order/load number (prefer the header identifier over numbers inside stop sections), BOL number, PO number
- Equipment (mapped to dry_van / reefer / flatbed / hopper_bottom), commodity, weight, total miles
- Reefer: setpoint, range, continuous run
- Rate: total carrier pay under any of its many labels, plus the line-item breakdown when the document shows one
- Stops: sequence, pickup/delivery, facility, street/city/state/zip, contact, appointment start/end, reference number + the broker's label
- A consolidated Special Instructions block

Date handling: all broker formats normalized to timestamps; a date with no time leaves the time unset rather than defaulting to midnight.

**Never guess on money or times.** The prompt states explicitly that rate figures and appointment times must be returned null when uncertain — an empty field is correct, a confident wrong number is not.

### Special instructions block

Written as a clean readable list into `special_instructions`, consolidating: detention rate / free time / notification requirement, layover, TONU terms and non-payment conditions, lumper handling and reimbursement deadlines, per-occurrence penalties (missed check calls, late paperwork, lost tracking, late delivery, unreported damage), paperwork deadlines and consequences, required tracking apps, fuel advance fees, facility check-in procedures.

### Rate line items

Base amount maps to `linehaul_rate`. A broken-out rate is never collapsed into one flat number, and every extracted line always appears in the itemized rate breakdown appended to `special_instructions`, so no charge is ever silently lost.

An "Extra Stop" style charge is auto-assigned to a stop **only** when all of these hold:

- the load has three or more stops, and
- the document explicitly ties the charge to a specific named middle stop, and
- the extraction confidence for that association is high.

In that case `stopoff_charge_amount` is set on that stop and marked medium confidence so the dispatcher verifies it.

In every other case — two-stop loads, a charge that cannot be tied to a specific stop, or any confidence below high — the parser assigns it to no stop. The review screen surfaces it as an **unassigned rate line** showing the broker's label and amount, with a prompt to assign it to a specific stop or leave it out. A two-stop load has no middle stop and so no eligible stop-off, yet brokers still bill "Extra Stop" on them; that discrepancy belongs in front of the dispatcher, not papered over by the parser picking a stop.

### Reference-number filtering

Only gate- and invoice-relevant numbers are kept: pickup, delivery, BOL, PO, appointment confirmation. Coordinates, pallet counts, internal routing codes and other operational noise are discarded.

## 4. Loadout detection

The function scores signals for a trailer relocation: no BOL exists, photos serve as POD, commodity is "Trailer", a multi-day pickup-to-delivery window, trailer condition / damage / return language. With two or more signals it flags a suspicion and lists the evidence.

The load type is never set silently. The review screen shows a prompt: "This looks like a Trailer Relocation" with the cited evidence and Confirm / Not a relocation. On confirm, `load_type` becomes `loadout` and the trailer fields fill from whatever the document provided.

## 5. Broker matching

Extracted broker is matched against `brokers` by MC number first, then by fuzzy company-name match (punctuation, suffixes, casing tolerated). Never auto-selected. A confirmation card shows extracted details next to the matched record with three paths: confirm the match, pick a different broker, or create a new broker pre-filled from the extraction.

## 6. Review screen

The existing Create Load form opens pre-filled — not a new form.

- **High** confidence: filled normally
- **Medium**: filled, with a gold "verify" marker on the field
- **Low**: left empty, with a note that the parser could not read it, so the dispatcher types it rather than trusting a guess

A side panel / sheet shows the original PDF next to the form during review. A "Discard parse" action clears everything back to a blank manual form. The uploaded PDF is held client-side and only written to storage as a `load_documents` row of type `rate_confirmation` when the load is saved.

## 7. Failure handling

Any API failure (including credit or rate-limit responses) shows a plain message and leaves the form fully usable for manual entry. A failed parse never blocks load creation.

## Technical notes

- Migration: two nullable columns on `load_stops` (no grant or RLS changes needed — existing table policies cover them).
- New edge function `supabase/functions/parse-rate-confirmation/index.ts`; PDF sent as a base64 document part; staff-only, JWT validated in code.
- New client pieces: `RateConfirmationUpload.tsx` (drop zone + progress), `ParsedBrokerMatchCard.tsx`, `LoadoutSuspicionPrompt.tsx`, `SourcePdfPanel.tsx`, plus `src/lib/rateConParse.ts` mapping the extraction result onto `LoadFormValues` and a confidence map.
- `loadFormSchema.ts` gains the two stop fields; `CreateLoadPage.tsx` gains the parse header and confidence marks only — save logic unchanged.
- shadcn/ui components already in the project; charcoal + gold tokens throughout.
