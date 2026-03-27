

## Keep Headline on One Line (Mobile-Safe)

### Change
**File:** `src/pages/SplashPage.tsx` (line 89)

Replace the current responsive text classes with a fluid `clamp()` size and `whitespace-nowrap`:

```
className="text-[clamp(1.6rem,5.5vw,3.75rem)] whitespace-nowrap font-bold text-surface-dark-foreground leading-tight tracking-tight mb-6"
```

This scales the font smoothly from ~25px on a 320px screen up to 60px on desktop, keeping "Drive with purpose. Build your future." on a single line at all viewport widths without overflow.

### Files changed

| File | Change |
|------|--------|
| `src/pages/SplashPage.tsx` | Replace fixed breakpoint text sizes with `clamp()` + `whitespace-nowrap` on the `<h1>` |

