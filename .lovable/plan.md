# Pinned-message banner polish

## What you'll see

The pinned banner above each conversation becomes more compact and adds a proper way to browse all pinned messages when a thread accumulates several.

**Compact banner (always visible when ≥1 pin)**
- Single-line header showing a pin icon, the count (e.g. "3 Pinned"), and a "View all" link on the right.
- Below it, a one-line preview of the most recent pin only (truncated with "…").
- Clicking the preview jumps to that message in the thread (existing behavior).
- Staff still see a small "X" to unpin the most recent pin inline.

**"View all pinned" sheet (opens from the banner)**
- A side sheet (right-side on desktop, bottom on mobile) listing every pinned message in the thread, newest first.
- Each row shows: sender name, sent date, message body (or attachment name with paperclip icon), and the time it was pinned.
- Click a row → sheet closes, thread jumps to that message and briefly highlights it (uses the existing `jumpToMessage` highlight).
- Staff get an "Unpin" button on each row.
- Empty state isn't needed (sheet only opens when pins exist).

## Why this is better than today

Today's banner shows up to 3 pins inline with a "+ N more" line that isn't clickable, so anything beyond the third pin is invisible. The new design keeps the header out of the way (1–2 lines) and gives a dedicated, scrollable surface for the full list.

## Technical notes

- New component: `src/components/messaging/PinnedMessagesSheet.tsx` using the existing shadcn `Sheet` primitive (`side="right"` on `md+`, `side="bottom"` on mobile via the same `Sheet` with responsive class on `SheetContent`).
- Update `src/components/messaging/MessageThread.tsx`:
  - Replace the current 3-pin list with the compact single-line preview + "View all" trigger.
  - Add local `pinnedSheetOpen` state and render `<PinnedMessagesSheet>`.
  - Pass `pinned`, `isStaff`, `togglePin`, and a `jumpToMessage` wrapper that closes the sheet first.
- Sender display name: re-use the same lookup pattern as `MessageBubble` (the bubble already resolves names via the parent — we'll fetch a small `profiles` map keyed on sender_id inside the sheet, or pass an existing `nameForUserId(id)` helper if `MessageThread` already has one). If no helper exists, the sheet will do its own one-shot `profiles` query for the unique sender IDs in the pin list.
- No DB, RLS, or edge-function changes — purely UI on top of existing `messages.pinned_at` + `pinned_by` data.
- Highlight reuse: `jumpToMessage` already scrolls + flashes the bubble; the sheet just calls it after closing.

## Files

- `src/components/messaging/MessageThread.tsx` — slim down banner, add sheet trigger.
- `src/components/messaging/PinnedMessagesSheet.tsx` — new component.