

## Reset Flipbook to Page 1 on Each Open

### Root cause
`BinderFlipbook` (lines 162–171) restores its `index` from `sessionStorage` using `storageKey`. The three callers always pass a `storageKey`:

- Operator portal: `flipbook:${userId}`
- Staff drill-down (Johnathan's view): `flipbook:staff:${driverUserId}`
- Admin: `flipbook-admin:${selectedDriverId}`

Every page you visit is written back (line 200), so the next time the binder is opened it picks up where you left off — not page 1. That's why Johnathan's binder reopened on page 13 of 15.

### Fix
Remove the auto-resume behavior so the flipbook always opens on the **Cover (page 1)**.

In `src/components/inspection/BinderFlipbook.tsx`:
1. **Initial state** (lines 162–171): drop the `sessionStorage` lookup. Initialize to `Math.min(initialIndex, pages.length - 1)` only.
2. **Persist effect** (lines 198–201): remove the `sessionStorage.setItem` write. With no resume, no need to persist.
3. Leave the `storageKey` prop in place (typed as optional, currently unused) so callers don't need to change — it just becomes a no-op. We can also delete the prop entirely; preference below.

### One small choice
The `storageKey` prop is now dead code. Two options:

| Option | What it does |
|---|---|
| **A. Keep prop, ignore it** | Zero risk. Callers untouched. Prop sits unused. |
| **B. Remove prop + all 3 callers' usages** | Cleaner. 4 files touched (BinderFlipbook + 3 callers). |

Recommend **B** for a clean removal, but A is fine if you'd rather minimize blast radius.

### Files
| File | Change |
|---|---|
| `src/components/inspection/BinderFlipbook.tsx` | Remove sessionStorage read + write so flipbook always opens on cover |
| (Option B only) `OperatorInspectionBinder.tsx`, `OperatorBinderPanel.tsx`, `InspectionBinderAdmin.tsx` | Drop the `storageKey={...}` prop |

### Why this is safe
- Pure UI behavior tweak — no data, no auth, no permissions touched
- Cover page already exists at index 0 in every caller's `pages` array
- All other flipbook features (swipe, keyboard nav, dot indicator, share, QR) keep working

