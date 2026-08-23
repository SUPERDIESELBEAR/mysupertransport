# Rolling River parse: diagnostics write failure, rate preservation, loadout use window, inline detail

## Step zero — cause found: every diagnostic insert is rejected by RLS and the rejection is swallowed

The write is reached, the misses are collected, and the insert fails. Confirmed against the live database:

- `parser_diagnostics.created_by` defaults to `current_profile_id()` — a `profiles.id`.
- The INSERT policy `Dispatch staff log parser diagnostics` requires `created_by = auth.uid()`.
- Across all 165 profiles, `profiles.id` never equals the auth uid (0 matches). That check can never pass: **every insert returns 42501.**
- The two surviving Blue Grace rows were written at 17:58 UTC, before the actor-stamp migrations later that afternoon changed the default to `current_profile_id()`. Their `created_by` is a profile id. Nothing has been written since.
- `logParserDiagnostics` catches the error and calls `console.warn` only, which is why the failure was indistinguishable from never being called.

Ruled out: `logParserDiagnostics` is reached on the create path after verification; `takeAnchorMisses()` is drained only inside that call, so nothing else emptied the buffer; and the Rolling River failures are ordinary `anchor_miss` shapes the collector handles.

### Widened policy audit — already run, results below

Two catalog sweeps across the whole `public` schema, not just this family:

1. **Every RLS policy whose expression compares a `profiles(id)` foreign-key column directly to `auth.uid()`** (checked in both operand orders, all commands, all tables): exactly one hit — `parser_diagnostics` / `Dispatch staff log parser diagnostics` / INSERT / `created_by = auth.uid()`. No other table has this mismatch.
2. **Every column in `public` whose default calls `current_profile_id()`**: exactly one — `parser_diagnostics.created_by`.

Verdict: the actor-stamp work left one default/policy pair disagreeing, and it is this one. Every other policy touching a profiles-FK column gates on `has_role(auth.uid(), …)` only and never equates the column to a uid, so it is unaffected. Both sweeps are re-run and reported after the fix migration.

Fix, before anything else is built:

1. Migration: replace the INSERT policy's `created_by = auth.uid()` with `created_by = current_profile_id()`, matching the column default and the server-side-actor rule.
2. Make the failure loud: `logParserDiagnostics` still never interrupts a parse, but a failed write now raises a toast on the parse screen ("Parser diagnostics could not be recorded") and logs through `logDbError`.
3. Regression test over the whole actor-default set, not just this table: for every column in `public` whose default stamps an actor via `current_profile_id()`, assert the table's insert policy accepts a row carrying that default — and assert no policy in `public` equates a `profiles(id)` FK column to `auth.uid()`. Both sweeps live in the test, so a new table added later is covered without editing the test.
4. Verification: re-run the Rolling River document, confirm rows land, and report what they captured — failure codes and heading lines — before section 5's anchor report is finalised.

## Answers to the other questions

**Sidebar entry.** It exists in the Dispatch portal under a `Tools` divider (`/dispatch/parser-diagnostics`). Management has no entry — that is why you could not find it. The same entry is added to the Management portal sidebar.

**Trailer use window — there is no field for it.** The loadout section stores only `loadout_use_period_days`, a plain number of days. No start date, no end date, nothing the parser can fill from "08/17/2026 through 08/24/2026". This plan adds them.

## 1. A load type change must not discard a parsed amount

Switching to Trailer Relocation currently leaves `linehaul_rate` populated but unused: the total-value calculation and the save payload both read `loadout_relocation_fee` for a loadout, so the $150 vanishes from view and from the saved load.

Fix as a carry, not a clear:

- On a load type change, map the amount across: standard/per-ton `linehaul_rate` to `loadout_relocation_fee`, and back the other way.
- Only carry when the destination field is empty, so a value typed by dispatch is never overwritten.
- When both fields hold different non-empty values, show a confirmation before the switch takes effect, naming both amounts.
- A carried value is marked as needing verification (the same gold marker the parser uses for medium confidence), because a linehaul rate and a relocation fee are not the same thing even when the number matches.

## 2. Loadout trailer use window

New per-load window, parser-filled and dispatch-editable — not a fixed duration.

- Migration: `loadout_use_start` and `loadout_use_end` (dates, nullable) on `loads`. `loadout_use_period_days` stays and becomes derived/display-only so existing rows keep meaning.
- Form: a start/end date pair in the loadout section, with the day count shown alongside. Validation only that end is not before start — no five-to-ten-day rule.
- Parser: extract the granted use window from the rate confirmation when the document states one, filled at the confidence level the extraction reports. Left empty when the document does not state it — never inferred from the stop appointment dates.
- Load Detail: the window shown on the loadout card so dispatch can see the freight-hauling period at a glance.

## 3. Placeholder text in a reference field

"Assign at pickup" is an instruction, not an identifier, and storing it creates a permanent phantom reference in every future diff.

- A placeholder vocabulary check runs on every reference value before it is stored: `assign at pickup`, `TBD`, `to be assigned`, `to be determined`, `N/A`, `none`, `see BOL`, `at pickup`, `will advise`, `pending`, and similar, matched case- and punctuation-insensitively on the whole value only (a value that merely contains the word "none" is kept).
- A matching value leaves the reference blank rather than storing the phrase.
- Each one is logged as a `reference_row_dropped` diagnostic carrying the label and the placeholder phrase, so the vocabulary grows from real documents.
- Placed in the shared classification path so it is reached from both the create parse and the revision re-parse.

## 4. Inline diagnostics on the parse screen

The information exists at parse time and is currently only readable after abandoning the load. It gets surfaced where it is produced.

- Each `Field not found on the page` verdict in the parse review gains the failure code in plain language (`no_anchor`, `ambiguous`, `empty_region`, `comment_precedes_heading`, `no_text_layer`) and an expandable list of the heading-shaped lines the parser saw in the document.
- This reuses the region result already returned by the resolver — the same data the diagnostics table stores — so no second extraction pass.
- The same detail appears on the revision re-parse screen.
- `/dispatch/parser-diagnostics` stays as the cross-document view. Its sidebar entry is verified to render, and the same entry is added under Tools in the Management portal.
- Step zero: confirm why this parse wrote no diagnostic rows, and fix that, since the accumulated view is worthless if writes are being lost.

## 5. Anchors — reported, not added

Per your instruction, no anchors are added in this work. What this document would need, recorded in the build status doc as pending until MegaCorp and Nationwide are in:

- `stop_notes_verbatim`: the stop anchors are all `inlineOnly`, requiring `Comments:` with a colon and inline text. Rolling River prints `Comments` as a bare heading with the body on following lines. Supporting it needs a bare-heading stop-comment anchor plus a terminator rule, and that interacts with the existing `comment_precedes_heading` guard — which is exactly why it should be designed against three documents, not one.
- `broker_terms_verbatim`: the three anchors are a Blue Grace-shaped paragraph opener, `Terms and Conditions`, and `Broker-Carrier Agreement`. This document has none of them; the heading it actually prints goes into the report once diagnostics capture it.

## Technical notes

- Migration: two nullable date columns on `loads`; existing table policies and grants cover them.
- `loadFormSchema.ts`: `loadout_use_start` / `loadout_use_end`; `loadSavePayload.ts` writes them only for loadout loads.
- Rate carry lives in a pure helper (`src/lib/loadTypeCarry.ts`) with unit tests, called from the load type control in `CreateLoadPage.tsx`.
- Placeholder detection in `src/lib/referenceClasses.ts` (or a sibling `referencePlaceholders.ts`), wired into the shared classify path so `parserPathWiring.test.ts` proves both entry points reach it.
- Inline detail rendered inside `VerbatimRepairField.tsx` under the `region_unresolved` verdict, fed by the existing `RegionResult` and `documentHeadings`.
- Tests: rate carry both directions and the conflict case, placeholder vocabulary including near-miss values that must be kept, use-window round trip, and reachability of the placeholder check from create and revision.
