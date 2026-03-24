
## Extend Demo Mode Write Guards

Four components need `useDemoMode` imported and `guardDemo()` called at the top of each write handler. The pattern is identical across all four: import the hook, call `guardDemo()` early-return if it returns `true`.

---

### Changes

**1. `DocumentEditorModal.tsx`**
- Import `useDemoMode`
- Call `if (guardDemo()) return;` at the top of `handleSave` (line ~201)

**2. `EquipmentAssignModal.tsx`**
- Import `useDemoMode`
- Call `if (guardDemo()) return;` at the top of `handleAssign` (line ~59)

**3. `EquipmentReturnModal.tsx`**
- Import `useDemoMode`
- Call `if (guardDemo()) return;` at the top of `handleReturn` (line ~35)

**4. `ICABuilderModal.tsx`**
- Import `useDemoMode`
- Call `if (guardDemo()) return;` at the top of three handlers:
  - `handleSaveAndClose` (line ~158)
  - `handleSaveAndSend` (line ~207)
  - `handleSaveDraft` (line ~305)

---

### No prop-drilling needed
All four components are self-contained modals that call `useToast` directly — `useDemoMode` follows the same pattern. No parent component changes required.
