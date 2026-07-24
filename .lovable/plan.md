## Problem

In the Dispatch Board table view, the Status cell can render up to three stacked chips:

1. Primary status badge (Dispatched / Home / Truck Down / Not Dispatched)
2. Streak chip (e.g. `2w 1d`) — only when status is Home / Truck Down / Not Dispatched
3. Unlogged-days chip (e.g. `1 unlogged`) — only when there are unlogged days in the rolling window

Because each chip is on its own line and only some rows have them, row heights vary noticeably (some rows are ~40px, others ~90px). The eye reads this as a "ragged" column and the whole table feels misaligned.

## Recommendation

Keep all the same information, but present it in a single, fixed-height row of chips so every driver's Status cell occupies the same vertical space.

### Layout change (Status cell only)

- One horizontal row: `[● Status badge] [streak chip] [unlogged chip]`
- `flex flex-wrap items-center gap-1.5` so it still wraps gracefully on narrow widths, but on md+ it stays on one line
- Fix a `min-h` on the cell (roughly the height of one chip row + small padding) so cells with only the primary badge are the same height as cells with all three chips
- Reduce the streak chip and unlogged chip to compact "meta" chips (icon + number only, e.g. `⏱ 2w 1d`, `⚠ 1`) with the full text moved into the tooltip. This keeps the row narrow and scannable.

### Visual hierarchy

- Primary status badge keeps its current color treatment (it's the most important signal).
- Streak and unlogged chips become subdued outline chips (muted background, colored border/icon matching severity) so they read as secondary metadata, not competing status pills.
- Remove the amber solid fill on the unlogged chip in favor of a small amber dot + count; it currently draws more attention than the primary status itself.

### Row alignment

- Add `align-middle` to all `<td>`s in the table so the Operator column (avatar + name + phone + History toggle, which is the tallest cell) and Status cell center vertically instead of top-aligning, which today amplifies the ragged look.
- Give the Status `<th>` and `<td>` a fixed `min-w` (e.g. `min-w-[220px]`) so the column doesn't shift width row-to-row when chips appear/disappear.

## Scope

Frontend-only change in `src/pages/dispatch/DispatchPortal.tsx`, table branch only (lines ~1980–2125). No changes to card view, no data or query changes, no changes to what information is shown — just how it's laid out.

## Out of scope

- Card view layout (already uses a wrapping status strip).
- Any changes to which chips appear or the underlying streak / unlogged logic.
- Colors of the primary status badges themselves.

## Open question

Want me to also apply the same compact single-row treatment to the card view's status strip for consistency, or leave cards untouched?
