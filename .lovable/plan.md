## Fix: Refresh button should also load latest published code

### What's happening now

The dashboard's refresh button calls `useAppRefresh()` (`src/hooks/useAppRefresh.ts`), which does a **soft refresh only**: it re-fetches the user profile and invalidates React Query caches. It never reloads the HTML/JS bundle, so freshly published Lovable code does not appear until the user manually hard-refreshes the browser or the 2-minute `useVersionCheck` poll fires its "New version available" toast.

Result: clicking Refresh shows a "Up to date" toast even when a newer build is sitting on the server.

### Fix

Make the refresh button compare the running build version against `/version.json` and, if a newer build is available, do a hard reload. Otherwise keep the existing soft-refresh behavior.

Concrete changes in `src/hooks/useAppRefresh.ts`:

1. Read the build version baked at compile time via `declare const __BUILD_VERSION__: string;` (already exposed by Vite — `useVersionCheck.tsx` uses it).
2. At the start of `refresh()`, fetch `/version.json?t=${Date.now()}` with `cache: 'no-store'`. Skip this check on preview/dev hosts (reuse the same `isPreviewHost()` predicate pattern as `useVersionCheck`) so Lovable previews don't trigger surprise reloads.
3. If `data.version` differs from `__BUILD_VERSION__`:
   - Show a brief toast: "Loading latest version…"
   - Call `window.location.reload()` (which already preserves the current path/query). The pending soft-refresh work is skipped because the page is about to unload.
   - Also dismiss the sticky `id: 'version-update'` toast if present so it doesn't reappear post-reload.
4. If versions match (or the fetch fails/network down): fall through to the existing `refreshProfile()` + `queryClient.invalidateQueries()` path with the "Up to date" toast — unchanged.

### Why this is the right scope

- Single hook change. Both `StaffLayout` and `OperatorPortal` already use `useAppRefresh`, so management, staff, and operator refresh buttons all benefit automatically.
- Preserves the no-flash soft-refresh UX when no new build exists (the common case).
- Hard reload only happens when there's actually new code — no perf regression.
- Reuses the same `/version.json` mechanism `useVersionCheck` already polls, so behavior is consistent across the toast and the button.

### File

- `src/hooks/useAppRefresh.ts` — add version check + conditional hard reload at the top of `refresh()`.

### Out of scope

- No changes to `useVersionCheck` (the background poller stays as-is).
- No changes to button UI in `StaffLayout` or `OperatorPortal`.
- No service worker / cache changes.
