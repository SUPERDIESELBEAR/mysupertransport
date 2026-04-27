## Goal

Once a driver is fully onboarded, shrink the dominant "Onboarding Stages" section into a collapsed "Onboarding History" card and elevate the **Inspection Binder** as the primary feature on the operator dashboard — including a one-tap **Flipbook** launch for roadside inspections.

---

## Changes

### 1. Collapse onboarding history when fully onboarded
In `src/components/operator/OperatorStatusPage.tsx`:

- When `isFullyOnboarded` is `true`:
  - **Hide** the dark "Overall Progress" card (lines ~784–834).
  - **Hide** the 3-tile quick-stats row (Completed / In Progress / Remaining, lines ~849–880).
  - **Replace** the always-visible "Onboarding Stages" timeline (lines ~882–890) with a collapsed **"Onboarding History"** card using shadcn `Collapsible`:
    - Closed by default. Header shows: a checkmark icon, "Onboarding History", subtitle "All stages complete", and a chevron.
    - Expanding reveals the existing `MilestoneNode` timeline (no logic changes — same data, just gated behind the trigger).
  - Keep the celebratory "Fully Onboarded!" header card.
- When `isFullyOnboarded` is `false`: behavior is unchanged.

### 2. Add a prominent Inspection Binder hero card
In `OperatorStatusPage.tsx`, when `isFullyOnboarded`, render a new **Inspection Binder hero card** *above* the contact footer (and above the new collapsed history card). Card contents:

- Dark/gold styling to match the brand (mirrors the existing dark surface card pattern).
- Icon: `Shield` in gold; title "Inspection Binder"; subtitle "Show this at any DOT roadside inspection."
- Two large action buttons:
  1. **"Open Binder"** → `onNavigateTo('inspection-binder')` (opens list view)
  2. **"Open Flipbook"** → `onNavigateTo('inspection-binder?view=pages')` (opens directly in flipbook mode)
- A small status line: "All Clear ✓" (green) or "N expiring soon" (red) — derived from the existing `cdlExpiration` / `medicalCertExpiration` props that the component already receives.

This card must remain visible whether or not the operator is onboarded — but is **always shown first** (before the progress block) when fully onboarded so it is the dominant element.

### 3. Wire deep-link to flipbook mode
- In `OperatorPortal.tsx`, the `setView` accepts the existing view names. Extend the navigation contract so a query like `?tab=inspection-binder&binderView=pages` (or a new `setView('inspection-binder', { binderView: 'pages' })` signature) opens the binder with flipbook auto-open.
- Pass a new optional `initialViewMode?: 'list' | 'pages'` prop to `OperatorInspectionBinder`.
- In `OperatorInspectionBinder.tsx`, on mount, if `initialViewMode === 'pages'`, set `viewMode = 'pages'` and `flipbookOpen = true` (mirrors the existing button at lines 244–251).

### 4. Sidebar/menu emphasis (no new menu item needed)
The "Inspection Binder" entry already exists in both desktop nav (line 699) and mobile bottom nav (line 728). To make it stand out:

- In `OperatorPortal.tsx`, add a small gold **"DOT"** pill badge next to the Inspection Binder nav label when the user is fully onboarded, using the existing `badge` rendering pattern. This signals it as the field-critical feature without introducing a new menu structure.

---

## Files touched

- `src/components/operator/OperatorStatusPage.tsx` — hide progress/stats, collapse history, add Inspection Binder hero card.
- `src/pages/operator/OperatorPortal.tsx` — pass through `binderView` to the binder, add "DOT" badge to the nav item.
- `src/components/inspection/OperatorInspectionBinder.tsx` — accept `initialViewMode` prop and auto-open flipbook.

No database or edge-function changes required.

---

## Out of scope

- No changes to the Inspection Binder's internal layout, data, or admin views.
- No changes to onboarding logic, stage definitions, or completion calculation.
- Mobile bottom nav already includes the Binder — no restructuring.
