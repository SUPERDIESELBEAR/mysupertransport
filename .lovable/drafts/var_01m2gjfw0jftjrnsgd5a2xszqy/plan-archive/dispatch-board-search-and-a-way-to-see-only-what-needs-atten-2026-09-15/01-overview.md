# Dispatch Board: search, and a way to see only what needs attention

Today the Dispatch Board lists every dispatchable driver in delivery order with one control: a dispatcher dropdown. Finding one driver, one unit, or one load number means scrolling. And the problems the board already knows about — loads under a claim, loads waiting on paperwork, loads with a status past Available and no driver — are scattered down the page or reduced to a single link.

This adds two things to that page and nothing else.

## 1. Search

A search box beside the dispatcher filter. Typing narrows the board to matching driver rows and matches on:

- driver name
- unit number
- load number of any load in the driver's chain (current, booked behind, or awaiting paperwork)
- pickup or delivery city / state of any load in the chain

Matching is case-insensitive, ignores spaces and dashes in load numbers, and combines with the dispatcher filter (both must match). Search input is debounced. A clear button appears while text is present. When nothing matches, the board shows a distinct message with a "Clear search" action rather than the generic empty state.

## 2. Attention filter

A row of small toggle chips under the header, each showing a live count. Selecting one or more narrows the board to driver rows carrying that problem; selecting none shows everything.

- **Claim** — a load in the chain has an active Hold or Watch claim
- **Awaiting paperwork** — the driver has delivered loads still in the paperwork tail
- **No load** — a dispatchable driver with no load recorded in SUPERDRIVE
- **Late / due today** — a load in the chain whose delivery time is in the past or falls on today, in carrier time

Chips with a zero count render disabled, so the board says at a glance that there is nothing to chase in that category.

The existing "N loads have a status past Available but no driver assigned" line stays as-is: it is about loads, not driver rows, so it keeps pointing at the Loads list.

## What does not change

No new data is fetched, no database change, no edit to dispatch status from this page, no change to how the chain is assembled or ordered, and no change to the Driver Status page.
