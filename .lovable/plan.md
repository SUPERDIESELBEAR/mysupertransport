## Goal

Give fully-onboarded operators a proper **Home** screen as the app's default view, with large, glove-friendly tiles for the four most-used destinations. Demote the **Status** (onboarding) screen out of the bottom nav once onboarding is complete — it becomes a secondary screen reachable from Home and the side menu, not the always-visible default.

## How it should feel

When an operator opens the app:

- **During onboarding** → behavior is unchanged. Default view stays **Status / My Progress** so they keep working through the stages. Bottom nav looks the same.
- **After full onboarding** (insurance added) → default view becomes **Home**. Status is no longer in the bottom nav. The four big tiles below are the operator's everyday hub.

### Home screen layout

A header greeting ("Good morning, Marcus") plus a 2×2 tile grid (1 column on small phones, 2 columns from `sm:` up):

```text
┌─────────────────────────┬─────────────────────────┐
│   3-Ring Binder         │   Settlement Forecast   │
│   (Shield icon)         │   (Calculator icon)     │
│   "DOT inspection-ready"│   "This week's pay"     │
├─────────────────────────┼─────────────────────────┤
│   My Truck              │   Resource Center       │
│   (Truck icon)          │   (BookOpen icon)       │
│   "Equipment & docs"    │   "Guides & how-tos"    │
└─────────────────────────┴─────────────────────────┘
```

Below the tiles, keep the existing **Next-Step CTA** banner (compliance expiries, etc.) and a small **"View onboarding status →"** link so the Status page is still discoverable.

Tiles use the existing dark surface + gold accent treatment, large icon (28–32px), bold label, one-line subtitle, and a subtle right chevron. Tapping a tile sets the corresponding `view` (`inspection-binder`, `forecast`, `my-truck`, `resource-center`).

### Bottom nav changes (mobile, fully-onboarded only)

Current bottom nav (5 slots): Status · Binder · Messages · Doc Hub · context-slot

New bottom nav for onboarded operators (5 slots):

```text
[ Home ] [ Binder ] [ Messages ] [ Doc Hub ] [ Dispatch / ICA / FAQ ]
```

- **Home** (new) replaces **Status** as the leftmost slot.
- Status remains accessible via:
  1. The "View onboarding status" link on the Home screen
  2. The hamburger menu (where the full `navItems` list already lives)
  3. The desktop top nav (unchanged — Status still listed)

For operators **still in onboarding**, the bottom nav and default view are unchanged (Status stays as slot 1 and as the default).

## Technical implementation

All changes are in **`src/pages/operator/OperatorPortal.tsx`** (one file).

1. **New view type**: extend `OperatorView` union with `'home'`. Add `'home'` to both `useState` initializer and the `useEffect` whitelist that validates `?tab=` deep links.

2. **Default view logic**: in the `useState(() => …)` initializer for `view`, when there is no `?tab=` param, default to `'home'` if onboarded, else `'progress'`. Since `isFullyOnboarded` isn't known at mount, do the redirect inside an effect: once `onboardingStatus` loads and `view === 'progress'` *and* the URL has no explicit `?tab=`, switch to `'home'` if `isFullyOnboarded`. (Guard with a "did we already auto-redirect" ref so we don't fight the user.)

3. **Home view component**: render inline under the existing `view === '...'` blocks (around line 1137). Uses existing `Card` / button styles; no new shadcn components needed. Each tile is a `<button>` calling `setView(...)`.

4. **Nav arrays**:
   - `navItems`: insert a `'home'` entry at the top with `Home` icon from lucide. Keep `'progress'` entry (label it "Onboarding Status" once `isFullyOnboarded`, else "My Progress").
   - `mobileNavItems`: when `isFullyOnboarded`, replace the first slot (`progress`) with `home`. When not onboarded, leave as-is.

5. **Greeting**: simple time-of-day function (`new Date().getHours()` → Morning/Afternoon/Evening), uses `displayName` already computed in the file.

6. **No DB / RLS / edge function changes.** No new dependencies. No changes to `BinderFlipbook` or other components.

## Out of scope

- Changing the desktop top-nav order beyond adding "Home" at the front.
- Removing Status entirely (still needed for compliance expiry visibility and the `next-step CTA` deep link `setView('progress')`).
- Reworking the hamburger menu or notifications.

## Open question for you

Should the **Status** entry stay visible on the desktop top nav for onboarded operators, or also be moved to the overflow there? I'd recommend **keep it visible on desktop** (plenty of room) and only demote it on mobile where space is tight — but happy to hide it on desktop too if you prefer a cleaner top bar.
