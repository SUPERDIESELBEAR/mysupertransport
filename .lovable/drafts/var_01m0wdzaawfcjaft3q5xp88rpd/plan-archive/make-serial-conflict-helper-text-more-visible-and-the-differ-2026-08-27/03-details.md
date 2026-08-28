## Technical detail

- File: `src/components/equipment/SerialConflictsPanel.tsx`, lines 302–313.
- Replace the small muted helper paragraph with a more prominent treatment: slightly larger text, foreground color, and an info-style left border or background so it reads as instructions.
- Change the **These are different devices** button from `variant="ghost"` to `variant="outline"` (or add an explicit border) so it visually competes with **Keep this record** and looks tappable/selectable.
- No changes to `src/lib/equipmentSync.ts`, the merge dialog, or any other logic.
