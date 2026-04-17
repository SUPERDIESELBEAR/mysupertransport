

## Fix: "Could not load this document for editing" for application-sourced binder docs

### Root cause (verified)

When you click **Edit** on Johnathan McMillan's CDL/Medical in the Inspection Binder, the editor calls:
```ts
supabase.storage.from('inspection-documents').download('applications/175...jpg')
```
…which 404s, because his CDL/Medical actually live in the `application-documents` bucket (their `file_path` starts with `applications/`).

Three call sites hardcode `bucketName='inspection-documents'` regardless of where the file actually lives:
| File | Line | Bug |
|---|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | 2299 | `bucketName={previewFilePath ? 'inspection-documents' : undefined}` |
| `src/components/inspection/OperatorBinderPanel.tsx` | 234 | `setPreviewBucket('inspection-documents')` for per-driver docs |
| `src/components/inspection/OperatorInspectionBinder.tsx` | (per-driver doc click handler) | same — sets `'inspection-documents'` for per-driver docs |

**Scope**: 76 of 315 binder rows (~24%) are application-sourced — affects the same set of drivers as the previous flipbook fix (Johnathan, Ronald Lockett, ~25 others).

### The fix — one-line bucket derivation, applied in three places

Add a tiny helper at the top of `DocRow.tsx` (and re-export it):
```ts
export function bucketForBinderDoc(filePath: string | null | undefined): string {
  if (filePath?.startsWith('applications/')) return 'application-documents';
  return 'inspection-documents';
}
```

Then update the three callers to use it instead of hardcoding:

**1. `InspectionBinderAdmin.tsx` line 2299**
```ts
bucketName={previewFilePath ? bucketForBinderDoc(previewFilePath) : undefined}
```

**2. `OperatorBinderPanel.tsx` per-driver Eye button (~line 234)**
```ts
setPreviewBucket(bucketForBinderDoc(doc.file_path));
```

**3. `OperatorInspectionBinder.tsx` per-driver Eye button**
Same — derive from `doc.file_path` instead of hardcoding `'inspection-documents'`.

(Driver-uploads rows already correctly use `'driver-uploads'` — left untouched. Company-wide docs always live in `inspection-documents` — also fine.)

### What this fixes immediately
- Johnathan McMillan's CDL Front, CDL Back, Medical Cert → editor opens, download succeeds, can rotate/crop and save
- Same for Ronald Lockett and all other ~25 drivers whose application docs got copied into the binder
- Operator side too (drivers viewing their own binder)

### Save path note
The editor's `onSave` already writes back to whatever bucket it downloaded from, so re-saving an application-sourced edit will correctly upload to `application-documents` and re-sign. No migration needed.

### Files changed
| File | Change |
|---|---|
| `src/components/inspection/DocRow.tsx` | Add and export `bucketForBinderDoc` helper |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Use helper in `FilePreviewModal` `bucketName` prop |
| `src/components/inspection/OperatorBinderPanel.tsx` | Use helper when calling `setPreviewBucket` for per-driver docs |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Same |

### Why this is safe
- Pure derivation from existing `file_path` data — no schema, no migration, no edge function
- Falls back to `'inspection-documents'` (current behavior) for any path that doesn't start with `applications/`
- Driver-uploads + company-wide docs paths are unchanged
- One-line helper, three one-line call-site swaps

