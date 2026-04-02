

## Include Both Owner Name and Business Name in ICA

### Problem
Currently the opening paragraph uses only `operatorName` (the driver's profile name) and the signature page shows only `operatorName`. When both an Owner Name and Business Name are entered in the ICA builder, neither appears in the opening paragraph or signature page — they only show in Appendix A.

### Changes

**`src/components/ica/ICADocumentView.tsx`** — three updates:

1. **Derive a combined contractor label** near the top of the component:
   - If both `data.owner_name` and `data.owner_business_name` exist: `"John Smith d/b/a ABC Trucking LLC"`
   - If only `data.owner_business_name`: use business name
   - If only `data.owner_name`: use owner name
   - Fallback: `operatorName` (profile name)

2. **Opening paragraph (line 106)**: Replace `{operatorName || fmt(null)}` with the combined contractor label so it reads: *"...and **John Smith d/b/a ABC Trucking LLC** ("Contractor")."*

3. **Signature page contractor header (line 214)**: Replace `{operatorName}` with the combined contractor label so both names appear above the signature line.

### Files changed

| File | Change |
|------|--------|
| `src/components/ica/ICADocumentView.tsx` | Derive combined contractor label; use in opening paragraph and signature page |

