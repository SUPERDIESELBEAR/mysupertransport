

## Move Driver Name & Action Buttons to the Top of the Operator Detail Panel

### What changes

The driver name row with action buttons (Place on Hold, Deactivate, Resend Invite, Save Changes) currently renders **after** the stages completion summary, upfront costs card, and truck & equipment card. This plan moves that header block to the very top of the panel — the first thing staff sees when opening a driver.

### Current order (top to bottom)
```text
1. Stages completion summary card
2. Upfront Costs card
3. Truck & Equipment card
4. Sticky mini-bar (hidden until scroll)
5. ← Header: Back button + Driver Name + Action Buttons ←
6. On Hold banner
7. Status badges
8. Compliance banners / pills
9. Cert expiry history
10. Onboarding progress (second card)
11. Stage dot row + Collapse All
12. Stages 1–7
```

### New order
```text
1. ← Header: Back button + Driver Name + Action Buttons ←
2. On Hold banner
3. Status badges
4. Stages completion summary card
5. Compliance banners / pills
6. Upfront Costs card
7. Truck & Equipment card
8. Sticky mini-bar (hidden until scroll)
9. Cert expiry history
10. Onboarding progress (second card)
11. Stage dot row + Collapse All
12. Stages 1–7
```

### Technical detail
In `src/pages/staff/OperatorDetailPanel.tsx`, the header block (lines ~2140–2247) and the On Hold banner + status badges (lines ~2249–2269) will be cut from their current position and pasted immediately after the opening `<div className="space-y-6 ...">` at line 1565 — before the stages completion summary.

The compliance alert banner and compliance pills will also move up to sit right after the status badges, providing immediate visibility into urgent issues.

### Files changed
| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Reorder JSX blocks: move header + on-hold banner + status badges + compliance sections above the summary/costs/truck cards |

