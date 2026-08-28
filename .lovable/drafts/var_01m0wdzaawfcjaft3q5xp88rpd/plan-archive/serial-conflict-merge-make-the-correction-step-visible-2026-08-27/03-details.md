## Technical detail

- File: `src/components/equipment/SerialConflictsPanel.tsx` — button label and footnote copy only.
- No change to `mergeEquipmentItems` in `src/lib/equipmentSync.ts`; the `correctedSerial` option, the collision re-check on the corrected value, the onboarding-record push, and the `serial_corrected_from` / `serial_corrected_to` audit entries all stay as built.
- The dialog's own radio group, custom-serial input, dash validation, and correction summary line stay unchanged.

## Note on the second pair in your screenshot

`C7715B8Z6` / `C771SB8Z6` are both shown as Unit 259 · Wendell James. That is one driver holding two records for the same camera, so keeping either record and confirming the right digit resolves it without closing anyone's assignment — the dialog already detects that same-driver case and words itself accordingly.

## Reminder about this draft

These changes live only in this draft. They reach the live app when you accept the draft.
