## Goal
Make the Equipment Asset Sheet card collapsed by default in both the staff (management) and driver (operator) views. Users tap the header to expand. If the sheet is already signed/locked, it opens expanded so the completed record is immediately visible.

## Changes

**File:** `src/components/equipment/EquipmentAssetSheet.tsx`

1. Add local state `expanded`, initialized from `signed` (true when signed, false otherwise).
2. Convert the existing header row (icon + title + subtitle + Locked badge) into a clickable button that toggles `expanded`. Add a chevron (ChevronDown / ChevronRight) on the right side to indicate state. Preserve the current visual style; only wrap it in a button and add the chevron.
3. Wrap all body sections (Outbound Shipment Receipts, equipment lines, verification UI, signature area, return-instructions modal trigger area, inbound receipts, etc.) in a conditional `{expanded && (...)}` block. The card container, header, and Locked badge stay visible when collapsed.
4. Add accessible attributes: `aria-expanded`, `aria-controls`, and a region wrapper `id` on the collapsible body.
5. When collapsed and unsigned, show a small hint under the title like "Tap to open" (subtle, muted). When collapsed and signed, keep the existing "Signed {date}" subtitle.

## Behavior summary

| State | Default | Notes |
|---|---|---|
| Unsigned, staff view | Collapsed | Tap header to expand |
| Unsigned, driver view | Collapsed | Tap header to expand |
| Signed (locked) | Expanded | Auto-expands so the record is visible |

## Out of scope
- No changes to persistence, RLS, signing logic, receipts, verification, or return-instructions flow.
- No changes to `OperatorDetailPanel.tsx` or `OperatorPortal.tsx` — the component is self-contained.
