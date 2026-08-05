# Driver detail page — structure, sticky progress bar, internal notes

## 1. Recommended section order

Current order (top to bottom): identity header + actions, Truck Owner, status pills, Exclude from Dispatch Hub, progress card, Contact Info, Uploaded Documents + compliance chips, Upfront Costs, Truck card, Cert Expiry History, Onboarding Progress, stage list (1-9), Inspection Binder, Driver Documents, Settlement Forecast, Internal Notes, Recently Deleted, Submitted Application.

Proposed order — "who they are, where they stand, what's left, then reference material":

```text
1  Identity header + action row (unchanged, sticky)
2  Onboarding Progress + stage chips        <- moved up, directly under header
3  Stage list (Stage 1 - Stage 9)           <- the work, right under the progress it drives
4  Internal Notes                           <- moved up; staff read/write while working stages
5  Contact Info
6  Truck card (truck info + devices/cards)
7  Truck Owner                              <- moved down; rarely used, currently eats the top of the page
8  Uploaded Documents + CDL / Med Cert compliance chips
9  Driver Documents  |  Inspection Binder   <- reference docs grouped together
10 Upfront Costs Paid by SUPERTRANSPORT     <- moved down; finance, not onboarding flow
11 Settlement Forecast (read-only)
12 Exclude from Dispatch Hub                <- moved down into a settings position
13 Recently Deleted Documents
14 Submitted Application (collapsed)
```

Rationale for the biggest moves: Truck Owner and the Exclude-from-Dispatch banner currently push the progress bar and stages below the fold on a laptop, even though both are edited once (or never). Progress + stages are what staff open the page for, so they come first. Internal Notes sits next to the stages instead of at the very bottom, so notes are written while reviewing, not after scrolling past everything.

## 2. Sticky progress bar

There is already a compact sticky bar (name, unit #, %, stage dots, Save) that appears once the main progress card scrolls out of view. In the screenshots it renders as a floating strip that visually collides with whatever stage header is underneath it, so it reads as broken rather than intentional.

Changes:
- Keep it sticky and pinned for the entire scroll (it already is) — this is the right behavior; no need to lock the full progress card.
- Give it an opaque background, bottom border, and a soft shadow so content clearly passes under it instead of through it.
- Make stage headers stick *below* the compact bar rather than at `top: 0`, so a stage title never sits under the bar.
- Clicking a stage dot in the sticky bar scrolls to that stage and expands it.

## 3. Internal Notes

They do save — but not automatically. The textarea writes into local state and is persisted to the driver record only when **Save Changes** (top bar / sticky bar) is pressed. That is invisible from the notes card, so notes feel like they might be lost.

Changes:
- Notes stay editable and are always appendable/editable in place (already the case).
- Add an inline status to the Internal Notes card: "Unsaved changes" -> "Saving..." -> "All changes saved - Xs ago", using the shared unsaved-status pill.
- Add a **Save notes** button on the card that persists just the notes, plus Cmd/Ctrl+S support.
- Auto-save the notes after ~1.5s of typing inactivity, so typing and navigating away cannot lose text; the existing unsaved-changes dialog still guards leaving with other unsaved stage edits.

## Technical notes

- All work is in `src/pages/staff/OperatorDetailPanel.tsx`; the file already assigns explicit `order` values in Quick View mode, so the reorder is a matter of moving the JSX blocks and updating those `order` numbers to match the new sequence.
- Sticky layering: the compact bar already sits at `sticky top-0 z-30`; stage header buttons also use `sticky top-0 z-20`. Stage headers move to a `top-[<bar height>]` offset and the bar gets `bg-background/95 backdrop-blur border-b shadow-sm`.
- Internal notes persistence reuses the existing `operators.notes` update path with `sanitizeText`, wired through `useUnsavedChanges` (`autoSave: true`, `debounceMs: 1500`) plus `UnsavedStatusPill` from `src/components/shared/`.
- No schema changes; stage completion logic, dirty tracking for stage fields, and the existing Save Changes flow are untouched.
