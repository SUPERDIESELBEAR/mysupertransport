# Amend docs/tms-build-status.md with the Blue Grace refinement pass

## Build status verified (not taken on faith)

All five items confirmed in code before drafting:

1. **Editable broker before creation** — `RateConfirmationParser.tsx` builds a prefill and opens `BrokerDialog`; no direct insert path remains.
2. **Currency prefix** — `src/components/ui/currency-input.tsx` exists and is used on six monetary fields in `CreateLoadPage.tsx` plus the stop-off amount in `StopsSection.tsx`; display only.
3. **Street suffix periods dropped** — `toTitleCase` strips a trailing period on street types; test asserts `500 W SEVENTH ST.` to `500 W Seventh St`.
4. **Internal capitals** — `applyInnerCapital` handles Mc/O' generally and Mac/De/La/Van via inclusion list; tests cover McCree, MacArthur, DeSoto.
5. **Broker address extraction** — parser schema carries `address_line1..zip` + `address_source` with remit-to > bill-to > letterhead preference and a single-block rule; `brokerAddressPrefill.ts` filters low confidence and builds the provenance line; `BrokerDialog` shows the source label and the note is appended to `notes`.

## Edit

**Rate confirmation parsing row** in the modules table: extend the description to name the refinement pass — editable pre-filled broker confirm dialog instead of one-click insert, currency-prefixed monetary inputs (display only), street suffix periods dropped, internal capitals preserved (McCree, MacArthur, O'Brien, DeSoto), and broker address extraction preferring remit-to over bill-to over letterhead, never mixing two blocks, with the source heading shown in the dialog and a provenance line appended to the broker's notes.

Because that is more than fits a table cell, the row stays short and a short **Rate confirmation parsing — refinements** subsection is added under "Built modules" listing the five items as bullets.

**Open item reword** (keeps the same case, removes the apparent contradiction):

> **Parsed broker address is not applied to an existing broker record.** Extraction is built; the address is only offered when a new broker is created from the document. When the dispatcher links an existing broker that has no address on file, the parsed address is discarded.

No other content changes.
