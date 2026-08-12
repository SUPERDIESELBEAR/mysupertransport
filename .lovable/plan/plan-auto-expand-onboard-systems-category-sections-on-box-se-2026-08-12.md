# Plan: Auto-Expand Onboard Systems Category Sections on Box Selection

## Goal
In the Onboard Systems Inventory tab, when a staff member selects one of the category boxes (ELD, Dash Camera, BestPass, or Fuel Card), the corresponding collapsible ribbon/section below should automatically expand. Currently the box only filters the list; the section remains collapsed unless the user also clicks the ribbon header.

## Current State
- `src/components/equipment/EquipmentInventory.tsx` renders the four category boxes at lines ~438-460.
- Clicking a box toggles `typeFilter` between that `DeviceType` and `'all'`.
- The collapsible sections below are controlled by a separate `expandedTypes` state and `toggleType` helper (lines ~131-152).
- The existing `lastOpened` + `sectionRefs` scroll logic already scrolls a newly expanded section into view.

## Changes
1. **Link box selection to section expansion.**
   - Update the box `onClick` handler so that selecting a category adds that `DeviceType` to `expandedTypes` and sets `lastOpened`.
   - Deselecting a box (clicking it again to return to "All") will leave the section expanded to avoid a jarring collapse; only the filter clears.

2. **Preserve existing behaviors.**
   - Keep the "By Driver" shortcut box behavior unchanged (it switches to the By Driver tab).
   - Keep the `section` prop auto-expand behavior unchanged.
   - Reuse the existing `scrollElementIntoViewWithOffset` effect so the expanded section scrolls into view smoothly.

## Verification
- Open the Onboard Systems Inventory tab.
- Collapse all sections.
- Click the ELD box: the ELD section should expand and scroll into view, and the list should filter to ELD devices only.
- Repeat for Dash Camera, BestPass, and Fuel Card.
- Confirm that clicking an already-selected box clears the filter but does not break the UI.
