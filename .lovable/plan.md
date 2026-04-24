

## Apply Darker Slate to "Not Dispatched" calendar cells

### Change

In `src/components/dispatch/MiniDispatchCalendar.tsx`, update the `not_dispatched` entry in the `STATUS_COLORS` map (line ~24) so logged "Not Dispatched" days are clearly visible against blank/unlogged days, while keeping the neutral feel.

```tsx
// Before
not_dispatched: {
  dot: 'bg-muted-foreground',
  bg:  'bg-muted/40',
  label: 'Not Dispatched',
  text: 'text-muted-foreground'
},

// After
not_dispatched: {
  dot: 'bg-slate-500',
  bg:  'bg-slate-200',
  label: 'Not Dispatched',
  text: 'text-slate-700'
},
```

### Result

- Logged "Not Dispatched" days get a soft slate wash + darker slate dot — visibly distinct from a white/unlogged blank day.
- Stays neutral, doesn't compete with green (Dispatched), blue (Home), or red (Truck Down).
- The bottom legend chip auto-picks up the new colors from the same map — no extra change needed.

### Files touched

- `src/components/dispatch/MiniDispatchCalendar.tsx` — single object update in `STATUS_COLORS`.

### Out of scope

- Dispatch Portal tile/badge for Not Dispatched (separate component, still uses `status-neutral`). Say the word if you want it aligned for end-to-end consistency.

