## Root cause

Emma's diagnostics show every tap forward followed 26–30ms later by a bounce entry with `historyStateKey: null` and `historyLen` unchanged. React Router pushes always include a router-generated key — a null key with unchanged length is the fingerprint of `window.history.back()`.

The only place in the app that calls `history.back()` is `src/hooks/useBackButton.ts`. It fires from:

1. The effect cleanup when the hook unmounts while `pushedRef.current === true`.
2. The `if (!isOpen)` branch when `isOpen` flips false.

Every Radix `Dialog` / `Sheet` in the app auto-sets its internal `isOpen` to `true` on mount, then calls `useBackButton(isOpen, ...)`. `FilePreviewModal` passes hardcoded `true`. When any of those unmount as a side effect of a route change — a Radix portal still mounted for a beat, a toast/notification popover, a modal inside a route subtree — the cleanup fires `history.back()` and reverses the navigation the driver just made. No portal-level trace fires, which matches the trace exactly.

## Fix

Make `useBackButton` safe: never call `history.back()` if doing so would reverse a real navigation. It should only pop its virtual entry when the current URL is still the URL that was there when the entry was pushed.

## Changes

### `src/hooks/useBackButton.ts`
- On the `pushState` push, capture `pushedHref = window.location.href` in a ref.
- Wrap all `history.back()` calls in a guard: `if (window.location.href === pushedHrefRef.current) window.history.back();` otherwise just clear the ref. The user (or router) has already moved past our virtual entry, so popping it would over-pop and rewind their real navigation.
- Keep existing popstate handling — that path is user-initiated back and stays correct.
- Add a nav trace entry (`kind: 'back-button'`, event: `skipped-back` vs `fired-back`) so future diagnostics show exactly when this hook fires.

### `src/lib/navTrace.ts`
- Add small `appendBackButtonTrace` helper mirroring the existing `appendAuthTrace` / `appendRouteTrace` wrappers.

### No other files change
- `dialog.tsx`, `sheet.tsx`, `DocRow.tsx` (FilePreviewModal), `DocRow.tsx:411` all keep their existing calls. The behavior stays identical when the modal is closed by the user on the same page; only the destructive unmount-during-navigation path is neutralized.

## Verification

- Reproduce Emma's tap sequence (`/operator/status` → tap "Review & Acknowledge Documents") in Playwright with an iPhone viewport and confirm `/operator/doc-hub` is reached and stays.
- Confirm hardware back on an open modal still closes it (unit-style check: mount, push virtual entry, dispatch popstate → `onClose` called; unmount while on same URL → `back()` still fires; unmount after URL change → `back()` skipped).
- Ask Emma to reinstall/reload the PWA and retry. Diagnostics will now show `back-button:skipped-back` entries at the moments where the old bug fired.

## Follow-ups (not in this change)

- Once the fix is confirmed, we can trim the temporary `guard-render`, `router-location`, and auth-lifecycle traces added earlier this week down to a much smaller ring buffer.
