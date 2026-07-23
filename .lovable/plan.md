## Two fixes in `OperatorPortal.tsx` and `OnboardingChecklist.tsx`

### 1. Fully-onboarded drivers still land on Progress
The current landing redirect (OperatorPortal.tsx ~line 950) early-returns whenever the URL is a "known operator route" — so a driver whose last saved URL is `/progress` (or who lands directly there) is never bounced to `/home`, even after we know they're 100% complete.

**Fix:** Extend the redirect so that when `onboardingStatusLoaded && isFullyOnboarded && view === 'progress'` AND this is a fresh entry (in-app nav counter is 0, i.e. they didn't click Progress themselves), we `navigate('/home', { replace: true })`. Onboarded drivers can still reach Progress via the "View onboarding status" link or bottom nav — that will bump the in-app counter so we don't fight them.

### 2. Onboarding progress banner not locked to top
`OnboardingChecklist.tsx` sets the sticky banner's `top` to `calc(env(safe-area-inset-top) + var(--st-header-h))`. That offset is correct only when the sticky element scrolls inside the window. In this app the scroll container is the inner `<div class="… overflow-y-auto …">` (OperatorPortal line 1432) which sits *below* the fixed header, so the top of that container is already `0` — the added header-height offset pushes the banner down into the middle of the viewport (exactly what the screenshot shows: the banner floats with the header visible above it and content visible above the banner too).

**Fix:** Change the sticky banner's `top` to `0` (and drop the `--st-header-h` var / safe-area math). The banner will then pin flush against the top edge of the scrollable region, sitting directly beneath the fixed black header on every device.

### Files
- `src/pages/operator/OperatorPortal.tsx` — extend the initial-landing redirect for fully-onboarded drivers on `/progress`.
- `src/components/operator/OnboardingChecklist.tsx` — set sticky `top: 0`, remove header-height offset.

No DB or business-logic changes.
