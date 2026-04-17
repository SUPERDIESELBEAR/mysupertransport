
## Make the Driver Selector Stand Out

### Where it lives
`src/components/inspection/InspectionBinderAdmin.tsx` lines 1181–1206 — the `<Select>` with placeholder "Select a driver to manage their binder…". Right now it's a plain default-styled SelectTrigger that visually blends with the page (same border, same background as everything else), so staff don't immediately notice they need to pick a driver before anything works.

### Proposed redesign

Wrap the selector in a prominent **call-to-action card** that only shows its "attention" styling while no driver is selected, then calms down once a driver is chosen.

**When no driver selected (attention state):**
- Gold-tinted card: `bg-gold/5 border-2 border-dashed border-gold/40 rounded-xl p-3`
- Small label row above the select: `UserCircle` icon + "Choose a driver to begin" in gold, semibold
- Larger SelectTrigger: `h-11 text-sm font-medium border-gold/30 bg-card` with placeholder text in foreground color (not muted) so it reads as instruction, not filler
- Subtle pulse animation on the icon (`animate-pulse`) to draw the eye

**When a driver is selected (calm state):**
- Drop the dashed border and gold tint → solid `border-border bg-card rounded-xl p-3`
- Label switches to "Managing binder for:" in muted-foreground
- Trigger returns to normal height/weight
- Flipbook button stays inline on the right as today

### Why this works
- Staff immediately see the empty-state card as the **next required action** rather than a generic dropdown
- Gold matches brand identity (#C9A84C) and is already used for primary CTAs
- Auto-calms once a driver is picked, so it doesn't keep shouting after the task is done
- No layout shift on mobile — the card still stacks naturally above the tabs

### File changed
| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | Replace lines 1181–1206 with the conditional attention/calm card wrapper around the Select + Flipbook button |

### Out of scope
- Operator-scoped view (`operatorUserId` branch, lines 1207–1217) — already has a driver implicitly, no selector shown
- Tab styling, document rows, flipbook itself — untouched
- No new dependencies, no logic changes, no DB
