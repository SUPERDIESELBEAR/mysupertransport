Fix intermittent iOS scroll glitch on floating stage banner in the driver app.

## What
When scrolling in the driver PWA, the fixed "Stage 1: Background Check" banner occasionally detaches/glitch-drags. This is an iOS Safari rendering bug with `position: fixed` + `backdrop-filter: blur`.

## How
Update the floating CTA wrapper in `src/pages/operator/OperatorPortal.tsx`:

1. **Remove `backdrop-filter: blur(12px)`** — the element is fully opaque, so this is pure rendering cost with no visual benefit.
2. **Promote to GPU layer** — add `transform-gpu will-change-transform` Tailwind classes and inline `style={{ transform: 'translateZ(0)' }}` to prevent Safari from demoting the layer mid-scroll.
3. **Anchor to safe area** — replace `bottom-16` with `bottom-[calc(4rem+env(safe-area-inset-bottom))]` so the banner stays pinned correctly when the iOS home indicator/address bar collapses during scroll.

No backend changes needed. No business logic changes.

## Technical Details
- File: `src/pages/operator/OperatorPortal.tsx`
- Affected element: the fixed bottom CTA banner (around `bottom-16` / `backdrop-filter: blur(12px)`)
- iOS Safari's dynamic viewport resizes mid-scroll; `backdrop-filter` on fixed elements forces re-rasterization each frame, which can detach the element from the compositor. Removing the blur and adding a GPU layer hint eliminates the root cause.