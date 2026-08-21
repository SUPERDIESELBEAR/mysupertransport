# Broker address extraction from rate confirmations

## What I found

The parser's broker block captures exactly five fields — company name, MC number, contact name, contact phone, contact email. There is no address field anywhere in the extraction schema, so today the parser cannot produce a broker address at all: the address inputs in the broker dialog are always blank because nothing is ever passed for them, not because a guess was suppressed. That answers your last question — the blank-not-guessed behavior is currently guaranteed by omission, and the plan below keeps it explicit in the prompt rather than by accident.

The broker dialog already exposes street, line 2, city, state, ZIP and normalizes them (title case for street/city, ZIP normalization). Only the prefill payload from the parser is missing those keys.

## My view on one address vs. two

I agree with your inclination: one address set is enough for now, and the parser should prefer the remit-to / bill-to address.

Reasoning:
- Every rate confirmation shown so far prints exactly one broker address, under a "Bill To" style heading (Blue Grace: `2846 S Falkenburg Rd, Riverview, FL 33578`). A letterhead corporate address, when it appears, is usually the same company location.
- The one operational use for a broker address in this app is invoicing, which is also why `billing_email` exists as its own field. The billing address is therefore the more valuable of the two, so if only one is stored it should be that one.
- Adding `billing_address_line1..billing_zip` now means four to five new columns, new dialog fields, and a "which one is this?" decision on every broker record, to serve a distinction we have not yet seen in the documents. That is a reasonable later migration if a document turns up with genuinely different corporate and remit-to addresses; nothing in this plan blocks it.

One safeguard instead of new columns: the parser reports which heading the address came from, the dialog shows that label next to the prefilled address ("From the document's Bill To block"), and the provenance is persisted into the broker's `notes` so it survives the save.

## Preference order when a document shows more than one

The parser picks one address using this order, and returns the label it used:

1. Explicit remit-to / payment address ("Remit To", "Send Invoices To", "Payment Address", "Billing Address")
2. Bill-to address ("Bill To", "Invoice To")
3. Corporate / letterhead address, only when neither of the above exists
4. Nothing — all address fields null

Never mixed: the chosen block's street, city, state and ZIP come from one block only. Partial blocks are allowed (street present, ZIP missing) but never completed from a second block.

The address is not taken from a footer, a fine-print legal block, or a factoring/lockbox notice, and never from a shipper, consignee or facility block.

## Blank when absent

The prompt states explicitly that a broker address must be returned null unless it is printed in an addressed block belonging to the broker. Anything that would require inferring from a logo, a phone-area code, a URL or a bare city name returns null. Confidence is `high` only for a clearly labelled remit-to/bill-to block, `medium` for a letterhead fallback; a `low` address gets left out of the prefill, consistent with how other low-confidence fields are treated.

## Persisted provenance in notes

When the parse supplies an address, one line is appended to the broker's `notes`:

```text
Address captured from Bill To block on rate confirmation, 8/21/26.
```

- Wording follows the chosen source: `Remit To block`, `Bill To block`, or `letterhead`.
- Date is the parse date in US Central, formatted `M/D/YY`.
- Appended on its own line after any existing notes text — never overwriting.
- Written into the dialog's notes field before save, so the dispatcher sees it and can edit or remove it.
- Only when an address is actually prefilled — no address, no line.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts`: add to the `broker` schema `address_line1`, `address_line2`, `city`, `state` (2-letter), `zip`, plus `address_source` (`remit_to` | `bill_to` | `letterhead` | null, not a confidence-wrapped field). Add the preference-order and never-guess rules to the prompt. Sanitize the new values through the existing `str()` helper; uppercase and length-check `state`; keep `zip` digits/hyphen only.
- `src/lib/rateConfirmation.ts`: extend the `broker` shape on `ParsedRateConfirmation` with the five address fields and `address_source`.
- `src/components/dispatch/loadForm/RateConfirmationParser.tsx`: include the address fields in `openCreateBrokerDialog`'s prefill (skipping any field whose confidence is `low`), and pass the source label through.
- `src/components/dispatch/loadForm/BrokerDialog.tsx`: when a prefilled address arrives from a parse, show a small muted note above the address group naming the source block, and append the provenance line to the `notes` textarea value. `normalizeWhitespace` on save must preserve the line break between existing notes and the appended line. No other change to validation or the saved payload — existing `toTitleCase` / `normalizeZip` handling applies.
- No migration, no schema change to `brokers`.
- Tests: prefill mapping (remit-to preferred over bill-to, letterhead-only fallback, low-confidence dropped, no-address leaving every field blank) plus the notes append (correct wording per source, appended after existing notes without overwriting, omitted when no address was captured).
