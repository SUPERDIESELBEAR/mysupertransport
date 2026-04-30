## Diagnosis

Reproduced live on `https://mysupertransport.lovable.app/`:
- The "Staff Sign In" link in the header registers a click (gold hover state appears) but the URL remains `/` and the page never loads `/login`.
- No JavaScript errors in the console.
- The `<Link to="/login">` and the `/login` route in `App.tsx` are both correctly configured.
- Auth backend is healthy (recent `/admin/users` and `/user` requests returned 200).

This is **not an authentication problem** — it's a navigation problem. The click is silently swallowed before React Router can process it. The most likely culprits, in order of probability:

1. **The PWA Install banner** (visible at the bottom of the page) or another fixed/absolutely-positioned overlay is intercepting pointer events somewhere in the layout tree, preventing the `<Link>`'s click handler from firing properly on the published build.
2. **`ResumeApplicationDialog`** is mounted on the SplashPage and may be rendering an invisible Radix overlay (`pointer-events: auto`) over the entire viewport even when `open={false}` — a known Radix bug pattern when a dialog is conditionally controlled.
3. **A stale service worker** from a previous PWA version is serving cached JS that has the bug, even after recent deploys.

```text
SplashPage
 ├── header (z-10)
 │    └── <Link to="/login"> Staff Sign In  ← click registers, navigation does not happen
 ├── hero / sections
 ├── PWA Install Banner  (fixed, bottom)    ← suspect overlay
 └── ResumeApplicationDialog (open=false)   ← suspect Radix portal
```

## Fix Plan

### Step 1 — Make the "Staff Sign In" link bulletproof

In `src/pages/SplashPage.tsx` (both the header link, line 74-79, and the footer link, line 182-184):
- Add explicit `relative z-20` and `pointer-events-auto` classes to guarantee the link sits above any sibling overlay.
- As a safety net, attach an `onClick` that calls `useNavigate()` programmatically, so even if the default `<Link>` behavior is blocked, navigation still occurs.

### Step 2 — Audit overlay culprits on SplashPage

- Inspect `ResumeApplicationDialog` to confirm it does not leave an invisible Radix overlay mounted when closed. If it does, gate the entire component behind `{resumeOpen && <ResumeApplicationDialog … />}` so it never renders an overlay until needed.
- Verify the PWA Install banner uses `pointer-events-none` on its outer wrapper (with `pointer-events-auto` only on its actual buttons), so it can't block clicks on links above it.

### Step 3 — Force a clean reload to bust the stale cache

- Bump `public/version.json` so the existing `useVersionCheck` hook prompts a refresh for any user already on the broken cached version.

### Step 4 — Verify in the live preview

- Reload the published site and confirm clicking "Staff Sign In" navigates to `/login`.
- Confirm clicking the same link in the footer also works.
- Confirm the page still works with the Install banner visible AND dismissed.

## Out of Scope

- No changes to authentication, roles, or session handling — those are confirmed healthy.
- No changes to the `LoginPage` itself; the page renders correctly once you reach it.

## Workaround for You Right Now

While I implement the fix, you can log in immediately by going **directly** to:

`https://mysupertransport.lovable.app/login`

That bypasses the broken splash-page link entirely.
