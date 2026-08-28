## Technical details

- `src/lib/equipmentSync.ts`: add `canonicalSerial()` (existing `normalizeSerial` plus `translate('OILS' → '0115')`) and `findNearMatches(deviceType, serial)` returning one-edit-distance candidates with holder names. `assertAssignable` compares on the canonical form and keeps its existing `DuplicateAssignmentError` wording.
- Staged migration (applies when the draft is accepted): replace `idx_equipment_items_serial_type` with a unique index on the canonical expression plus device type, and add an index to support the near-match lookup. Additive only — no column drops or retypes.
- `EquipmentAssignModal.tsx` and `EquipmentItemModal.tsx`: run the canonical duplicate check and the near-match warning on serial blur; block on the former, warn inline on the latter.
- New `SerialConflictsPanel.tsx` in `src/components/equipment/`, rendered above the device groups in `EquipmentInventory.tsx`. Merge closes the losing device's open assignment, repoints its assignment history to the surviving item, clears the losing driver's onboarding serial field, and writes an `equipment_serials_merged` audit entry. Dismiss records the pair so it stops surfacing.
- Wording: `EquipmentInventory.tsx` status map `lost.label` → "Not Returned", section title and subtitle, filter chip; `EquipmentItemModal.tsx` and `EquipmentReturnModal.tsx` option labels and management-only warnings; `EquipmentHistoryModal.tsx` return-condition label. Stored value stays `lost`.
- Last-holder display: `last_operator_name` is already resolved for damaged/lost items in `EquipmentInventory.tsx`; extend it to the Not Returned section header count line, `EquipmentHistoryModal.tsx`, and the return receipt so it reads "Not Returned — last held by <name>".

## Verify

Attempt to add `AABL36UGO24945` as a new ELD — it should be blocked naming James Onan. Attempt `AABL36UF380968` — it should warn about Chrestman's device but allow continuing. The conflicts panel should list exactly the three known pairs. Every "Lost" label should read "Not Returned", with the last holder's name shown beside it.
