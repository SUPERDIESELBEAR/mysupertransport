
## Root cause

The Save button has `className="flex-1 bg-gold ..."` on top of the shadcn `Button` default variant. The `Button` component applies `bg-primary` via `cva`. The `cn()` helper uses `tailwind-merge`, which merges class lists intelligently — but `bg-gold` is a **hand-written CSS utility** defined in `index.css`, not a standard Tailwind `bg-*` class. `tailwind-merge` does not recognize `bg-gold` as a background color utility, so it does NOT remove `bg-primary`. Both classes are present in the DOM, and `bg-primary` wins (it appears later in the compiled stylesheet).

This is why the button always shows the muted gold/grey `--primary` color instead of the rich `--gold-main` color.

### Fix — two-part

**Part 1 — Use a Tailwind-native gold token** so `tailwind-merge` can properly strip `bg-primary`.

Change the button's className to use `bg-[hsl(var(--gold-main))]` and `hover:bg-[hsl(var(--gold-light))]` — these are standard Tailwind arbitrary-value classes that `tailwind-merge` recognizes as background utilities and will correctly override `bg-primary`.

**Part 2 — Add `isDirty` tracking** so the button also gives a visual feedback signal after a photo upload.

Right now the photo uploads and saves instantly (directly to the DB in `handleAvatarChange`), so the form isn't "dirty" — but the user still expects the Save button to look active/gold after uploading. The simplest fix is to track an `isDirty` state that gets set to `true` whenever any field changes (including after a photo upload). This makes the button look fully active and branded while the user is in an editing session.

Actually the simplest and correct fix is just Part 1 — fix the CSS class conflict so `bg-gold` properly renders. The `--primary` and `--gold-main` are very close in hue (both 41°) but differ slightly in saturation: `--primary: 41 47% 54%` vs `--gold-main: 41 47% 54%` — wait, they're **identical**! So the color itself is the same. The visual difference the user sees must be the `disabled:opacity-50` from the `Button` CVA base class.

Re-reading the disabled condition: `disabled={loading || !firstName.trim() || !lastName.trim()}`. When the modal opens, firstName and lastName ARE populated, so this is false and the button is enabled. But wait — when does the modal first mount? The `useEffect` seeds the names on `open && profile`. If `profile` is null on first render or lags, firstName and lastName start as `''`, making `!firstName.trim()` true → button is disabled with opacity-50.

The real bug: **profile may not be available on the first render tick** after `open` becomes true. The `useEffect` fires asynchronously after mount, so for one render cycle `firstName = ''` and `lastName = ''` → button shows as disabled (opacity-50). After the effect runs and names are populated, React re-renders and the button becomes enabled — but the user may have already seen the grey/faded state and assumes it stays disabled.

**The actual fix**: Seed the initial state directly from props rather than waiting for the effect, OR derive the disabled condition differently — don't disable just because firstName/lastName are empty on mount; instead track whether there are actual unsaved changes.

Cleanest approach: initialize `firstName` and `lastName` state from `profile` at declaration time (using the profile from useAuth directly), so the button is never momentarily disabled on open. Also add `isDirty` tracking so the button visually highlights when something has changed.

### Changes — `src/components/EditProfileModal.tsx` only

1. Initialize `firstName`/`lastName`/`phone`/`homeState` state from `profile` directly (so they're populated on first render, not after effect)
2. Track `isDirty` — set true when any field changes or after avatar upload
3. The `disabled` condition changes to `loading` only (names are always valid since they're pre-populated; validation happens on submit)
4. Add a visual "pulse" or brightness change to the button only when `isDirty` — or simply ensure the button is always visibly gold (enabled) since names are always pre-seeded

This is a single-file fix, no DB/backend/schema changes.
