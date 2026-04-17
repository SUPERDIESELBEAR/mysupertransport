

User clarification: Don't add a new "Vehicle Registration" per-driver section. Instead, when an operator uploads their registration (because they have their own), drop it into the **existing** `IRP Registration (cab card)` per-driver binder section.

Let me revise the plan accordingly.

## Revised Plan: Conditional Registration Upload + Auto-Sync to Existing Binder Sections

### Part 1 — Conditional registration upload (operator Stage 2)

In `src/components/operator/OperatorDocumentUpload.tsx`:
- Remove `registration` from the always-shown `DOCUMENT_SLOTS`
- Add a conditional block (modeled on the Physical Damage Insurance pattern) that renders **only when** `onboardingStatus.registration_status === 'own_registration'`
- Mark it **Required** (gold pill) with copy: *"Since you have your own registration, please upload a current copy so your coordinator can verify it and file it in your inspection binder."*

Mirror the same conditional visibility on the staff side in `OperatorDetailPanel.tsx`.

### Part 2 — Auto-sync uploads to the Inspection Binder (existing sections only)

In `OperatorDocumentUpload.tsx → handleUpload`, after the existing `operator_documents` insert, also insert a row into `inspection_documents` for these two slot types:

| Stage 2 upload | Existing binder section (per-driver) |
|---|---|
| `truck_inspection` | `Periodic DOT Inspections` |
| `registration` | `IRP Registration (cab card)` |

```ts
const binderName = slot.key === 'truck_inspection' ? 'Periodic DOT Inspections'
                 : slot.key === 'registration'    ? 'IRP Registration (cab card)'
                 : null;

if (binderName && operator?.user_id) {
  await supabase.from('inspection_documents').insert({
    name: binderName,
    scope: 'per_driver',
    driver_id: operator.user_id,
    file_url: fileUrl,
    file_path: path,        // bucket: operator-documents
    uploaded_by: operator.user_id,
    expires_at: null,       // staff sets expiry later
  });
}
```

### Part 3 — Bucket routing for binder preview/editor

Extend `bucketForBinderDoc()` in `src/components/inspection/DocRow.tsx` to recognize `operator-documents` paths (path's first segment is a UUID, not `applications/`):
```ts
export function bucketForBinderDoc(filePath: string | null | undefined): string {
  if (!filePath) return 'inspection-documents';
  if (filePath.startsWith('applications/')) return 'application-documents';
  // operator uploads are stored under "{user_uuid}/..."
  if (/^[0-9a-f-]{36}\//i.test(filePath)) return 'operator-documents';
  return 'inspection-documents';
}
```

### Part 4 — No changes to `InspectionBinderTypes.ts`

`IRP Registration (cab card)` and `Periodic DOT Inspections` already exist in `PER_DRIVER_DOCS`. No new section, no schema change.

### Files to change

| File | Change |
|---|---|
| `src/components/operator/OperatorDocumentUpload.tsx` | Conditional Required Registration slot + binder auto-sync for both upload types |
| `src/components/inspection/DocRow.tsx` | Extend `bucketForBinderDoc()` to recognize `operator-documents` paths |
| `src/pages/staff/OperatorDetailPanel.tsx` | Hide/show staff-side Registration row based on `registration_status === 'own_registration'` |

### Why this is safe
- No schema change, no new binder section
- Operators not flagged `own_registration` see no UI change
- Auto-sync writes to existing sections drivers/staff already use
- Bucket routing additive — application & inspection paths unchanged

### After deploying
1. Staff sets Stage 4 → "O/O Has Own Registration"
2. Operator opens Stage 2 → sees new Required **Vehicle Registration** slot
3. Operator uploads it → appears under existing **IRP Registration (cab card)** binder section
4. Operator uploads **Truck Inspection Report** → appears under existing **Periodic DOT Inspections**

