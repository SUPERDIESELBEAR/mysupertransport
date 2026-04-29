## Goal

Operators don't intuitively know the "Pages" toggle gives them a familiar 3-ring binder experience. The fix is to **rename "Pages" to "3-Ring Binder"** and **promote it from a tiny segmented toggle into a prominent, hard-to-miss call-to-action card** at the top of the Inspection Binder. The List view stays available, but as a secondary option.

## Changes

### 1. Rename "Pages" view to "3-Ring Binder" everywhere it's user-facing

In `src/components/inspection/OperatorInspectionBinder.tsx`:
- The segmented toggle button currently labeled "Pages" becomes "3-Ring Binder".
- Internal state values (`'list' | 'pages'`) stay the same to avoid touching `BinderFlipbook`, deep-link logic, and the `initialViewMode` prop contract used by `OperatorPortal`.

### 2. Add a prominent "Open 3-Ring Binder" hero CTA

Directly under the dark cover-page card (around line 240, before the existing view-mode/select controls), add a new full-width gold-accented card:

```text
┌─────────────────────────────────────────────────────────┐
│  [BookOpen icon]  Flip Through Your Binder              │
│                   View your documents like a real        │
│                   3-ring binder — page by page.          │
│                                  [ Open 3-Ring Binder ▸ ]│
└─────────────────────────────────────────────────────────┘
```

- Uses the existing `gold` brand color and `surface-dark` palette so it stands out against the page.
- Tapping anywhere on the card (or the button) calls `setViewMode('pages'); setFlipbookOpen(true);` — the same handler the existing toggle uses.
- Includes a short helper sentence ("View your documents like a real 3-ring binder — page by page.") so the metaphor is obvious.

### 3. Demote the List/Binder segmented control

Keep the existing inline segmented toggle but:
- Move it inline with the "Select Documents" row (it's already there) and shrink its visual weight slightly so it reads as a secondary "view switcher".
- Update the second pill label from "Pages" to "Binder" with the `BookOpen` icon for consistency with the hero CTA.

### 4. First-run nudge (lightweight, optional polish)

Add a tiny one-time hint dot/pulse on the hero CTA until the operator has opened the 3-Ring Binder at least once. Tracked in `localStorage` with the key `binder_opened_v1` — no DB changes. Once they tap it, the pulse disappears forever on that device.

## Files touched

- `src/components/inspection/OperatorInspectionBinder.tsx` — only file requiring edits.

No DB migrations, no edge functions, no changes to `BinderFlipbook`, and no changes to the staff/admin binder views.

## Out of scope

- The staff-side `InspectionBinderAdmin` view is unchanged — staff already understand the toggle.
- The deep-link `?tab=inspection-binder&view=pages` contract from `OperatorPortal.tsx` keeps working unchanged.
