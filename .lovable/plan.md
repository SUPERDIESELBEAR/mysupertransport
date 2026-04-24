

## Backfill helpers for unlogged past days — A + B

### What you're getting

Two lightweight visual cues so dispatchers (e.g., Leo Wallace) immediately see when past days are missing a status, plus a clickable counter to jump straight to the gaps.

### A. Visual cue on unlogged past days — recommendation: **tiny "?"**

I recommend the **"?" glyph** over a dotted border, for three reasons:

1. **Carries meaning, not just attention.** A dotted border says "something is different here." A "?" says "this day is missing data" — a dispatcher reads the intent in one glance, no legend lookup required.
2. **Reads cleanly next to the status dots.** The calendar already uses small colored dots to convey state. A "?" in the same dot-sized slot fits the established visual grammar; a border wraps the whole cell and competes with the today-cell bold ring.
3. **Stays calm at scale.** A month with 10 unlogged days shows 10 small "?" marks — quiet. The same month with 10 dotted borders looks like a broken grid.

**Spec:**
- Applies only to **past days** (`dateStr < todayStr`) with **no `dispatch_daily_log` row** and only for operators whose dispatch tracking is active (skip for excluded operators per the existing exclusion rule).
- Render a small `?` in muted amber (`text-amber-600`) where the status dot would normally sit.
- Tooltip on hover: *"No status logged for this day — click to set one."*
- Today and future days: unchanged (no "?", no badge).
- Days before the operator's onboarding/start date: skipped (don't flag pre-employment days as "missing").

### B. "Unlogged days" counter chip

Add a small chip on each operator's Dispatch tab header, above the calendar:

```text
[ 3 unlogged past days ]   ← amber pill, clickable
```

- Counts unlogged past days within the **currently visible month** (matches what the dispatcher is looking at).
- Click behavior: scrolls/focuses the first unlogged "?" cell and opens its popover so the dispatcher can immediately mark it.
- Hides when count is 0.
- Color: same muted amber as the "?" glyph for visual continuity.

**Optional roster-level rollup (say the word if you want it):** a similar chip on the Dispatch Hub roster row showing total unlogged past days across the last 7 days per operator — useful for spotting Leo-Wallace-style coverage gaps at a glance. Not building unless you confirm.

### Out of scope

- C/D/E from the prior options (notifications, auto-default, bulk backfill tool) — not building now.
- Changing the Mark-range tool — unchanged.

### Files touched

- `src/components/dispatch/MiniDispatchCalendar.tsx` — add unlogged-past detection, render "?" glyph, add the counter chip + click-to-jump behavior.

### Technical notes

- Unlogged-past detection runs against the same `dispatch_daily_log` map already loaded for the month — no new query.
- Operator start-date guard: use the operator's `created_at` (or onboarding completion date if available) as the lower bound so newly onboarded operators don't show a wall of "?" for dates before they existed.
- Excluded operators (per `mem://features/dispatch/excluded-from-dispatch`) get neither the "?" nor the chip.

