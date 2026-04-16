

## Make ICA Deposit Election Interactive and Fillable

### Problem
The Deposit Election section in Section 4 of the ICA is currently static text — the checkbox, initials, and date are plain characters that cannot be interacted with.

### Approach
1. **Add 3 columns to `ica_contracts` table** via migration: `deposit_elected` (boolean), `deposit_initials` (text), `deposit_elected_date` (text)
2. **Update `ICADocumentView`** to accept and render these as interactive form fields during signing, and as static filled values when viewing a signed ICA
3. **Update `OperatorICASign`** to pass the deposit election state to the document view and include it in the signing save
4. **Update `ICABuilderModal`** and `ICAViewModal`** to pass through the stored deposit election data for preview/view modes

### Details

| File | Change |
|------|--------|
| **Migration** | `ALTER TABLE ica_contracts ADD COLUMN deposit_elected boolean DEFAULT false, ADD COLUMN deposit_initials text, ADD COLUMN deposit_elected_date text;` |
| `src/components/ica/ICADocumentView.tsx` | Add optional props (`depositElected`, `depositInitials`, `depositElectedDate`, and change handlers). Render a real `<Checkbox>`, `<Input>` for initials, and `<DateInput>` for the date inside the election box when in signing mode. Show filled values in view mode. |
| `src/components/operator/OperatorICASign.tsx` | Add local state for the 3 deposit fields. Pass them to `ICADocumentView`. Include them in the `.update()` call when signing. |
| `src/components/ica/ICAViewModal.tsx` | Read `deposit_elected`, `deposit_initials`, `deposit_elected_date` from the contract record and pass to `ICADocumentView` as read-only display. |
| `src/components/ica/ICABuilderModal.tsx` | No changes needed — builder creates the ICA before contractor signs, so deposit election fields start empty. |

### Behavior
- **During operator signing**: The checkbox, initials, and date fields are interactive. The operator can optionally check the box, type initials, and enter a date. These are saved alongside the signature.
- **After signing (view mode)**: If elected, the checkbox shows checked, initials and date display as filled text. If not elected, the section shows as unchecked with blank fields.
- **Print/preview**: Fields render as filled or blank based on stored data.

