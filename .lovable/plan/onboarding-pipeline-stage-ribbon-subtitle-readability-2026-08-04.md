# Onboarding Pipeline — Stage Ribbon & Subtitle Readability

Make each stage card easier to scan: a tighter, better-proportioned stage ribbon (header) and clearly bolder subtitles for the sections inside every stage.

## Problem

- The stage ribbon (e.g. "Stage 5 — Equipment Setup") stretches the full card width while the content below is constrained, so the header and body feel visually disconnected.
- Section subtitles inside a stage ("Truck Decals", "ELD", "Fuel Card", "Assigned Device Numbers", "Physical Damage Insurance", "Go-Live", etc.) currently render at 11px, muted grey, with a thin grey underline. They read at nearly the same weight as the field labels below them, so there is no clear hierarchy between "stage title", "section subtitle", and "field label".

## What changes

### 1. Stage ribbon
- Constrain the ribbon's inner content to the same max width as the stage body so the title, status pill, and chevron line up with the fields underneath.
- Slightly increase the stage title size and weight so it clearly outranks everything inside the stage.
- Keep the existing status pill, complete/exception colors, sticky behavior, and collapse chevron exactly as they are.

### 2. Section subtitles (all stages)
Introduce one shared subtitle style and apply it to every section heading across Stages 1-9:
- Larger and bolder than today (bold, dark foreground text instead of muted grey), still uppercase with wide tracking so it reads as a section marker rather than a field label.
- Replace the faint full-width grey rule with a stronger divider plus a short gold accent so sections separate at a glance.
- Add a bit more space above each subtitle so sections visibly group.

Field labels stay at their current small muted size — the contrast between them and the new subtitles is what creates the hierarchy.

### 3. Consistency pass
Audit every stage for section headings that use the old inline styling (including the gold "Shop Visit Exceptions" variant, which keeps its gold treatment) and convert them all to the shared subtitle component so no stage is left behind.

## Technical notes

- All work is in `src/pages/staff/OperatorDetailPanel.tsx` (presentation only — no logic, data, or completion-rule changes).
- Add a small local `SectionSubtitle` component in that file with an optional `accent="gold"` variant, then replace the ~15 inline `<p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">…</p>` headings with it.
- Ribbon change is a wrapper div with the same `max-w-4xl` used by the stage body, applied to each stage's header button contents.
- Colors use existing semantic tokens (`foreground`, `border`, `gold`) — no hardcoded colors.
