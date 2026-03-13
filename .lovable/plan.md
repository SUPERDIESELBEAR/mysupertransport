
## Fix: Logo squishing on the Welcome screen left panel

### Problem
On line 182 of `src/pages/WelcomeOperator.tsx`, the logo `<img>` uses:
```tsx
<img src={logo} alt="SUPERTRANSPORT" className="h-20 w-auto mb-8" />
```
Inside a `flex flex-col` left panel column, `w-auto` allows the image to expand to fill the full column width. If the logo PNG has a wide aspect ratio (e.g. wordmark/landscape format), the browser stretches its intrinsic width to fill available space and then compresses the height to `h-20` (80px), making it look squished.

### Fix — one line change
Add a `max-w` cap and `object-contain` to the logo so it respects its natural proportions and never exceeds a sensible width:

```tsx
// Before
<img src={logo} alt="SUPERTRANSPORT" className="h-20 w-auto mb-8" />

// After
<img src={logo} alt="SUPERTRANSPORT" className="h-16 w-auto max-w-[240px] object-contain mb-8" />
```

- `max-w-[240px]` — caps the rendered width so the image can't expand beyond 240px
- `object-contain` — preserves aspect ratio within the given bounds
- `h-16` (64px) — slightly tighter height since a constrained width will control the actual rendered size; prevents awkward excess vertical space

### File to edit
- `src/pages/WelcomeOperator.tsx` — line 182 only
