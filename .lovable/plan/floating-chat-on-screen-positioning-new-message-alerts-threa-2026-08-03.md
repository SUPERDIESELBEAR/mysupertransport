# Floating chat: on-screen positioning, new-message alerts, thread filters

## 1. Window always opens fully on screen

Today the saved position is only loosely clamped (the window may keep just 200px on screen and hang off the right/bottom edge), and it is never re-checked at the moment it opens.

- Re-clamp position every time the bubble is clicked, not just on load and browser resize.
- Clamp so the **entire** window fits: left/top never negative, right/bottom never past the viewport (small margin, plus the Jump-to-bottom clearance at the bottom-right).
- If the saved size is bigger than the current viewport, shrink it to fit before opening.
- The same clamp runs after drag/resize and on window resize, so the window can never be parked off-screen.

## 2. Letting the recipient know a message arrived

Recommended set, all built on pieces the app already has:

- **Live unread badge** on the gold bubble and the mobile Messages nav, updating in realtime for both staff and drivers.
- **Toast + soft chime** when a message arrives while the chat window is closed, showing sender name and preview; clicking it opens that thread. Uses the existing chime helper and honors notification preferences.
- **Desktop/browser notification** when the tab is in the background, via the existing desktop-notification hook and its per-user on/off preference.
- **Tab title blink**: browser tab shows `(2) SUPERDRIVE` while unread messages exist.
- Existing email fallback (`notify-new-message`) stays as-is for people who are offline.

## 3. Contacts rail filters

Add a small segmented filter at the top of the contacts rail:

- **Unread** — only threads with unopened inbound messages (count shown on the tab).
- **Chats** — only people you already have a conversation with (default view).
- **All** — every operator, for starting a new conversation.

The choice is remembered with the other window state; search works within the active filter; the collapsed avatar rail respects it too. Empty states read "No unread messages" / "No conversations yet — switch to All to start one".

## Technical notes

- `src/components/messaging/FloatingChatWindow.tsx`
  - Add a `clampToViewport(state)` helper used by `loadState`, the resize listener, drag/resize end, and the open action.
  - `WindowState` gains `railFilter: 'unread' | 'chats' | 'all'` (default `'chats'`), persisted in the same localStorage key.
  - Derived list: `threads.filter(matchesFilter).filter(matchesSearch)`, where `hasThread = !!t.lastAt`.
  - The realtime INSERT handler already updates unread counts; add toast + chime + desktop notification when the window is closed or the thread isn't the selected one.
- Tab title blink: small effect keyed on `totalUnread`, restoring the original `document.title` on cleanup.
- Reuse `src/lib/chime.ts` and `useDesktopNotifications` (respects `getDesktopNotifPreference`).
- Optionally apply the same three-way filter to the full-page `MessagesView` rail for consistency.