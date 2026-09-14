# Technical details

File: `src/components/messaging/FloatingChatWindow.tsx` (only file changed).

- `getDefaultState()` already computes the bottom-right anchor (`innerWidth - DEFAULT_WIDTH - 24`, `innerHeight - DEFAULT_HEIGHT - JUMP_BUTTON_CLEARANCE`). Extract that anchor math into a `defaultPosition()` helper returning `{ x, y }`.
- In the two open actions (the gold-bubble `onClick` around line 403 and the deep-link `openChat` handler around line 167), apply the anchor position instead of the persisted `x`/`y`: `clampToViewport({ ...prev, ...defaultPosition(), open: true })`.
- Persisted `width`, `height`, `railCollapsed`, `railFilter`, and `selectedUserId` still load from `localStorage` (`superdrive_floating_chat`); only `x`/`y` re-anchor on open.
- Drag/resize continue to save position mid-session; `clampToViewport` still guards small viewports.
- Verify in the preview: open → bottom-right; drag away, close, re-open → bottom-right again.
