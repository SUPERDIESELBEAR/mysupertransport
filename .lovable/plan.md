# Fuse Onboarding Progress Banner to Header

## Problem
The banner in `src/components/operator/OnboardingChecklist.tsx` (line 356) uses `sticky top-16 z-30` with `bg-surface-dark` and `shadow-lg`. It pins as a second dark strip below the black header, with page content visible both above and below it — so it reads as an orphaned floating bar instead of an extension of the header.

## Fix
Make the header and progress banner behave as a single pinned unit.

1. **Remove the shadow and border-bottom** on the progress banner so there is no visual seam between it and the header above it.
2. **Match the header's bottom edge exactly** — the header is `h-16` on mobile, `md:h-20` on desktop, but the banner is hard-coded to `top-16`. Change it to `top-16 md:top-20` so it sits flush under the header at every breakpoint (this alone removes the desktop gap).
3. **Add a shared shadow to the fused unit** by moving `shadow-lg` off the banner and onto the outer sticky wrapper, so header + banner cast one drop shadow onto the scrolling content beneath.
4. **Tighten the top padding** on the banner (`pt-3` → `pt-2`) so the "ONBOARDING PROGRESS" label sits tight against the header edge rather than floating in space.
5. **Keep the mini stage dots and progress bar** unchanged in position/content — only the framing changes.

## Result
- Header + progress banner appear as one continuous black surface pinned to the top.
- No visible gap or seam between them at any breakpoint.
- Content scrolls cleanly beneath the fused unit with a single shadow line, so the "part above / part below" overlap the user reported disappears.

## Files
- `src/components/operator/OnboardingChecklist.tsx` — banner sticky container class updates only. No logic, no layout of the surrounding page.
