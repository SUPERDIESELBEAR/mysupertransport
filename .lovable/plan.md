
## Mobile Onboarding Checklist — Full Step Breakdown

### What's being built

A new `OnboardingChecklist` component that replaces the existing `OperatorStatusPage` timeline view on **mobile only** (< md breakpoint). Desktop keeps the current milestone timeline unchanged.

The checklist is purpose-built for the 467px viewport the operator is currently using.

### Layout structure

```text
┌─────────────────────────────────┐
│  STICKY PROGRESS BAR            │  ← top-0, z-50, bg-surface-dark
│  Hi, [Name]  •  4/6  •  67%    │
│  [━━━━━━━━━━━━━━━░░░░░░░░░░] ← gold bar
└─────────────────────────────────┘
│  [⚠ Action banner if needed]   │  ← critical banners still show
│                                 │
│  STAGE 1 — Background Check ✅  │  ← compact stage header card
│    ✅ MVR               Received │  ← substep row
│    ✅ Clearinghouse      Received │
│    ✅ MVR/CH Approval   Approved │
│    ⏳ PE Screening      Scheduled│
│    ○  PE Result          Pending │
│                                 │
│  STAGE 2 — Documents 🕐         │
│    ✅ Form 2290         Received │
│    ⚠ Truck Title      Requested │
│    ○  Truck Photos   Not Started │
│    ○  Truck Inspection  Pending  │
│  [Upload Documents →]           │  ← CTA on active stages
│                                 │
│  STAGE 3 — ICA Agreement ○      │  ← not_started = muted/dim
│    (substeps hidden when not started)
│    Awaiting earlier stages…     │
│                                 │
│  ... stages 4-6                 │
└─────────────────────────────────┘
```

### Files to create / modify

**New file**: `src/components/operator/OnboardingChecklist.tsx`
- Self-contained component receiving same props as `OperatorStatusPage`
- Sticky progress bar at top using `sticky top-[64px] z-30` (below the 64px portal header)
- Stage cards with colored left-border accent matching status color
- Compact substep rows (icon + label + value, single line, 36px tall)
- `not_started` stages: show header only, substeps hidden, add italic hint
- `in_progress` / `action_required` stages: show all substeps fully expanded
- `complete` stages: show substeps but visually muted / ticked
- CTA button on stage 2 (Documents → navigate) and stage 3 (ICA → navigate) when relevant
- No dispatcher card, no quick-stats row, no contact footer (kept in main `OperatorStatusPage` for mobile scroll below)

**Modified file**: `src/components/operator/OperatorStatusPage.tsx`
- Import `OnboardingChecklist` and wrap it in `<div className="md:hidden">` at the top of the return
- Wrap existing content in `<div className="hidden md:block">` for desktop-only
- Pass all the same props through to `OnboardingChecklist`

### Sticky progress bar detail
- `sticky top-16 z-30` (sits just below the 64px `h-16` portal header)
- Dark surface background (`bg-surface-dark border-b border-surface-dark-border`)
- Left: "Hi, [Name]" in small muted text
- Right: `X of 6 complete` count
- Gold progress bar underneath (same 2.5px height as existing bar)
- Animated fill on mount with `transition-all duration-700`

### Stage card design
- Each stage = a `<div>` with left border accent (4px) colored by status:
  - complete → `border-l-status-complete`
  - in_progress → `border-l-gold`
  - action_required → `border-l-destructive`
  - not_started → `border-l-border opacity-60`
- Stage header row: colored icon + bold stage title + status pill (right-aligned)
- Substeps: 36px rows with `CheckCircle2 / Clock / AlertTriangle / Circle` icons, label text, and value text right-aligned
- Stages not yet started collapse substeps and show the `hint` text in italic instead
- Action CTA buttons (Documents, ICA Sign) render inside the card for the relevant active stage

### What stays the same on mobile
- All existing alert banners (truck-down, ICA required, docs requested) remain above the checklist
- Bottom sticky nav unchanged
- Contact section below the checklist (still inside the progress view)

### No database changes needed
All data already flows through `onboardingStatus`, `stages`, and `progressPct` props passed from `OperatorPortal.tsx`.
