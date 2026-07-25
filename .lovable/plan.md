## Diagnosis

Your signature **was saved** — the database has the signed row and a stored PNG path (`osas/.../...png` in the `signatures` bucket). The bug is display-only: both preview modals render the stored value as `<img src={path}>` directly, but the column holds a Storage path, not a URL. The browser can't resolve it, so you see the broken-image icon.

Affected files:
- `src/components/equipment/SignOffSheetPreviewModal.tsx` (staff "VIEW" modal)
- `src/components/operator/SignedAssignmentSheetsCard.tsx` (driver My Documents preview)

## Fix

1. In both preview components, resolve `driver_signature_data_url` against the `signatures` bucket using a signed URL (`supabase.storage.from('signatures').createSignedUrl(path, 3600)`) before passing it to `<img>`. Handle the loading/empty state and keep backward compatibility if the value ever starts with `data:` or `http`.
2. No database or upload changes — the sign flow itself is working.

## Verification

- Reopen the same signed sheet from the staff dashboard "VIEW" button and confirm the drawn signature image renders.
- Open the driver's My Documents → Onboard Systems Assignment Sheets preview and confirm the same image renders.
