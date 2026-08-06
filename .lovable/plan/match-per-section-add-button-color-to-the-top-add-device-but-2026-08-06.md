Match per-section Add button color to the top Add Device button

Update the per-section "Add {type}" buttons in `src/components/equipment/EquipmentInventory.tsx` so they use the same primary/default button style as the top-level "Add Device" button, instead of the current outline style.

Implementation details
- Remove `variant="outline"` from the per-section Add button rendered inside each expanded device-type section (ELD, Dash Camera, BestPass, Fuel Card).
- Keep the existing `size="sm"`, `className="gap-1.5 h-8 shrink-0"`, and click handler that opens the Add Device modal with the section type pre-selected.
- Also fix the observed runtime error in the same file where the `requestAnimationFrame` cleanup code assigns a property to a primitive number. Store the child frame ID in a React ref instead of attaching it to the returned frame ID.

No other files need changes.
