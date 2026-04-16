

## Fix: Documents Not Rendering in Staff Flipbook

### Root Cause

In `OperatorBinderPanel.tsx` (the staff-side panel), when building the `pages` array passed to `<BinderFlipbook>`, the `fileName` field is set to the **document's display name** (e.g. `"CDL (Front)"`, `"Lease Agreement"`) instead of the actual file URL/path.

```ts
// Current (broken) — line 539, 555
fileName: doc?.file_url ? key : null,   // "CDL (Front)" — no extension
```

`BinderFlipbook`'s `PageRenderer` uses `fileName` (or `fileUrl`) to detect file type via extension regex (`.pdf`, `.png`, `.jpg`, etc.). Since `"CDL (Front)"` has no extension, **every document falls through to the "Unknown type" fallback** → nothing renders.

The operator-side binder (`OperatorInspectionBinder.tsx` line 438, 453) does it correctly:

```ts
fileName: doc?.file_url ?? null,   // full signed URL → ".png" detected
```

Confirmed via DB: Johnathan Pratt has all 6 per-driver documents with proper file extensions (.pdf, .png, .jpg) — the data is fine; only the rendering logic is wrong on the staff side.

### Fix

Two-line change in `src/components/inspection/OperatorBinderPanel.tsx`:

| Line | From | To |
|---|---|---|
| 539 | `fileName: doc?.file_url ? key : null,` | `fileName: doc?.file_url ?? null,` |
| 555 | `fileName: doc?.file_url ? key : null,` | `fileName: doc?.file_url ?? null,` |

The driver-uploads page (line 568) already does `fileName: up.file_name ?? null` correctly (uploads carry their original filename with extension).

### Side Note (not blocking, will leave as-is)

The console warning `"Function components cannot be given refs. Check the render method of BinderFlipbook"` is harmless — it comes from `useSwipeGesture` attaching a ref to the inner `<div>`. Doesn't affect rendering.

### Files Touched

| File | Change |
|---|---|
| `src/components/inspection/OperatorBinderPanel.tsx` | Two-line fix to pass file URL (with extension) as `fileName` so `PageRenderer` can detect PDF vs image |

