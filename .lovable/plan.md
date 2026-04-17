

## Add Visible Build Version + Last Updated Timestamp

### Goal
Give staff a quick way to confirm they're on the latest build by showing a small version/timestamp badge inside the app. Useful right after you Publish — staff can glance at it and know if their PWA picked up the new version.

### Approach: Vite build-time constants
Vite can inject values at build time via `define` in `vite.config.ts`. We'll inject:
- `__BUILD_TIME__` — ISO timestamp of when the build ran
- `__BUILD_VERSION__` — short hash of the timestamp (e.g. `b7f3a2`) so it's easy to read and compare

Every time you click **Publish → Update**, Vite rebuilds and bakes in fresh values. No DB, no API call, no manual bumping.

### Where to display it

**Two placements** (both lightweight, no layout disruption):

1. **Staff sidebar footer** (`src/components/layouts/StaffLayout.tsx`) — small muted text below the user/logout area: `v.b7f3a2 · Apr 17, 2026 2:14 PM CT`
   - Visible to staff/management/dispatch on every internal page
   - Doesn't show to operators (their portal uses a different layout)

2. **Operator portal footer** (`src/pages/operator/OperatorPortal.tsx`) — same tiny line at the bottom of the portal so operators can also confirm their installed PWA is current

Both render via a single shared component: `src/components/BuildInfo.tsx`

### The component
```tsx
// src/components/BuildInfo.tsx
declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;

export function BuildInfo({ className }: { className?: string }) {
  const date = new Date(__BUILD_TIME__);
  const formatted = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return (
    <div className={className} title={`Build ${__BUILD_VERSION__} · ${date.toISOString()}`}>
      v.{__BUILD_VERSION__} · {formatted} CT
    </div>
  );
}
```

### Vite config addition
```ts
// vite.config.ts (inside defineConfig)
const buildTime = new Date().toISOString();
const buildVersion = Buffer.from(buildTime).toString('hex').slice(-6);

define: {
  __BUILD_TIME__: JSON.stringify(buildTime),
  __BUILD_VERSION__: JSON.stringify(buildVersion),
},
```

### Files changed
| File | Change |
|---|---|
| `vite.config.ts` | Add `define` block with build time + version hash |
| `src/components/BuildInfo.tsx` | New tiny component (~15 lines) |
| `src/components/layouts/StaffLayout.tsx` | Render `<BuildInfo />` in sidebar footer |
| `src/pages/operator/OperatorPortal.tsx` | Render `<BuildInfo />` at bottom of portal |
| `src/vite-env.d.ts` | Declare `__BUILD_TIME__` / `__BUILD_VERSION__` globals so TS is happy |

### Styling
Muted, small, unobtrusive: `text-[10px] text-muted-foreground/60 font-mono tracking-tight px-3 py-2`. Hover tooltip shows the full ISO timestamp for precise comparison.

### How you'll use it
1. Make a change → Publish → Update
2. Tell staff "the new build is `v.b7f3a2` from Apr 17 2:14 PM CT"
3. Staff opens their installed PWA — if they see an older version/date, they pull-to-refresh or quit-and-reopen
4. Once it matches, they're confirmed on latest

### Why this is safe
- Pure UI addition + one Vite config tweak
- No runtime dependencies, no network calls, no DB
- Build constants are tree-shakable strings — zero perf cost
- Tooltip with full ISO makes precise diffs trivial when troubleshooting

