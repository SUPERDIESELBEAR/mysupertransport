## Technical details

- Dismissals live in `localStorage` under `onboard_systems_serial_conflicts_dismissed` in `src/components/equipment/SerialConflictsPanel.tsx`. No database rows were written by the dismiss action.
- Immediate restore: clear that key in your browser (I can do it in the live preview), which repopulates the panel on next render.
- Panel changes in `SerialConflictsPanel.tsx`:
  - `dismiss()` fires a toast with an Undo action that removes the key from the dismissed set.
  - Track hidden pairs that still exist in the current item list; render a "N pairs marked as different devices — Show" footer line that clears them.
  - Render the component when there are no active conflicts but hidden pairs remain, instead of returning `null`.
- No schema, RLS, or merge-logic changes.
