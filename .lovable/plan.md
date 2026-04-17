

## Notify Users When a New Build Is Available

### Goal
When you Publish, anyone with the app already open (browser tab or installed PWA) sees a sonner toast: "A new version is available — Refresh now" with a one-click reload button. No reinstall, no manual cache clearing.

### How it works

**1. Build-time version (already exists)**
`vite.config.ts` already injects `__BUILD_VERSION__` on every build. We'll reuse it as the source of truth.

**2. Lightweight version manifest at a fixed URL**
On every build, write a tiny JSON file to `public/version.json`:
```json
{ "version": "b7f3a2", "buildTime": "2026-04-17T19:14:00Z" }
```
Done via a small custom Vite plugin in `vite.config.ts` — runs in the `buildStart` hook, no extra dependencies. The file is served from `https://mysupertransport.lovable.app/version.json` and is **never cached** (we'll fetch with `cache: 'no-store'` + a cache-busting `?t=` query).

**3. Polling hook**
New `src/hooks/useVersionCheck.tsx`:
- On mount, store the current `__BUILD_VERSION__` as the "session version"
- Every **2 minutes**, plus whenever the tab becomes visible (focus/visibilitychange), fetch `/version.json?t={Date.now()}`
- If the fetched `version` differs from the session version → fire toast (only once per detection)

**4. Toast UX (sonner)**
```ts
toast("A new version of SUPERDRIVE is available", {
  description: "Refresh to load the latest build.",
  duration: Infinity,        // sticky until dismissed/clicked
  action: {
    label: "Refresh now",
    onClick: () => window.location.reload(),
  },
  id: "version-update",      // dedupe — only one toast ever
});
```
Sonner is already mounted in `App.tsx` (`<Sonner />`).

**5. Wire it in**
Mount `useVersionCheck()` once inside `AppRoutes` in `src/App.tsx` (only when `user` is logged in, so the splash/login pages stay quiet).

### Edge cases handled
- **Dev/preview**: skip the check when hostname includes `lovableproject.com` or `id-preview--` (preview iframe rebuilds constantly — would spam toasts)
- **Network failure**: fail silently, retry next interval
- **Missing `version.json` (first deploy after rollout)**: skip silently
- **User dismisses toast**: don't re-fire for the same version (track `lastNotifiedVersion` in a ref)
- **Tab in background**: visibility listener catches them right when they return
- **Logout**: hook unmounts cleanly, no leaks

### Files changed

| File | Change |
|---|---|
| `vite.config.ts` | Add tiny inline plugin that writes `public/version.json` (or `dist/version.json`) on every build |
| `src/hooks/useVersionCheck.tsx` | **New** — polling + visibility + sonner toast |
| `src/App.tsx` | Call `useVersionCheck()` inside `AppRoutes` (gated on logged-in user) |

No DB, no edge functions, no new dependencies. Just one file written at build, one hook, one line in `App.tsx`.

### Why this is safe
- `version.json` is a plain static file — same domain, no CORS, no auth
- Polling is gentle (2 min + visibility) — minimal network impact
- Toast is dedupe'd by `id`, so no duplicates even if poll fires fast
- Skipped entirely on Lovable preview hosts so it never annoys you in the editor
- Works for both browser users and installed PWA users — same mechanism

