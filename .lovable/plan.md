# Fix the floating Messages chat window

Three problems, all in the staff floating chat widget (`FloatingChatWindow.tsx`) plus the shared jump button.

## 1. Overlap with "Jump to bottom"

Both the gold chat bubble and the Jump-to-bottom pill are pinned to the exact same spot (bottom-right, 24px in). The jump button stays put; the chat bubble moves up so the two stack vertically instead of covering each other. The open chat window's default position also shifts up so it clears the pill.

## 2. Minimize behavior

- Remove the "−" (minimize) button entirely.
- The "×" button closes the window and returns it to the gold circular message icon, exactly as described.
- Any previously saved "minimized" state in the browser is ignored/cleared, so no stray "Messages" bar can persist on screen.

## 3. Usable message layout

Today the window is ~360px wide split in half: a cramped contact column and a tiny message area. New behavior:

- Larger default window (roughly 720x600), still draggable and resizable.
- Contacts list stays visible as a narrower left rail with the search box, but the conversation gets the majority of the width.
- A collapse control on the contacts rail shrinks it to a compact avatar-only strip (still clickable to switch people, with unread badges) so the open message can use nearly the whole window. The toggle is remembered.
- Header shows the active person's name and avatar, with the "×" close on the right.
- Switching conversations is one click from the rail — no more swapping between list view and thread view.

## Technical notes

- `src/components/ui/ScrollJumpButton.tsx`: position unchanged (`bottom-6 right-6`).
- `src/components/messaging/FloatingChatWindow.tsx`:
  - bubble moves to `bottom-24 right-6` (above the jump pill), z-index kept above it.
  - `WindowState`: drop `minimized`, add `railCollapsed`; `loadState` strips the legacy `minimized` key.
  - `DEFAULT_WIDTH` 720 / `DEFAULT_HEIGHT` 600, min width raised so the two-pane layout never collapses; default `y` raised to clear the jump pill.
  - Body becomes a persistent two-pane flex: rail (`w-52`, or `w-14` avatar-only when collapsed) + `MessageThread` filling `flex-1`. Remove the `hidden md:flex` swap logic and the `onBack` list-return path.
  - Bump the `text-[10px]/[11px]` list styles to normal small sizes now that there is room.