## Goal
Fix the Truck Photo Guide so that after taking a photo, the UI immediately reflects the upload — the slot shows the green "Photo uploaded ✓" card with thumbnail, the counter ticks up (e.g. "1 uploaded"), and the **Next Photo** button turns gold so the user can continue to photo 2.

## Root cause (confirmed in code)

In `src/components/operator/TruckPhotoGuideModal.tsx`:

1. **State-wipe `useEffect` (lines 125–138)** runs on `[open, alreadyUploadedLabels]`. The parent (`OperatorDocumentUpload.tsx` line 818) recomputes `alreadyUploadedLabels` inline on every render — a brand-new array reference each time. Any parent re-render causes the effect to fire and **overwrite** the `uploaded` map with the seed (which contains only placeholder entries `fileUrl: ''` for already-saved photos), wiping the photo the user just uploaded.
2. **Brittle upload chain**: `createSignedUrl` runs *before* the DB insert and *before* `setUploaded`. If signing throws (e.g., transient storage/RLS edge case), the whole `try` jumps to `catch`, the spinner disappears, no toast may render visibly on mobile, and nothing is saved — yet sometimes the storage object is already written, leaving an orphan.

## Changes

### 1. `src/components/operator/TruckPhotoGuideModal.tsx`

**a. Stop the seed effect from clobbering live uploads**
- Change the seeding `useEffect` to depend on `[open]` only (not `alreadyUploadedLabels`), and only seed when transitioning from closed → open.
- When seeding, **merge** with current `uploaded` rather than replace, so any in-session uploads survive a parent re-render.
- Use a ref (`hasSeededRef`) to guarantee seed-on-open runs exactly once per open cycle. Reset it in `handleClose` / `handleComplete`.

**b. Reorder the upload flow so the UI updates the moment the file is safely stored**

Order inside `handleFileSelect`:
1. Upload to storage (existing 60s timeout race — keep).
2. Insert row into `operator_documents` with `file_url = path` (the storage path is sufficient — `FilePreviewModal` resolves it via `bucketName="operator-documents"`).
3. **Immediately** call `setUploaded(prev => ({ ...prev, [currentSlot.key]: { slotKey, fileName, fileUrl: path } }))` and fire the success toast.
4. **Then** attempt `createSignedUrl` in a separate `try/catch`. If it succeeds, update the same slot with the signed URL (for inline `<img>` thumbnail preview). If it fails, log a `console.warn` and leave the slot marked as uploaded — the thumbnail simply won't render but the slot is green and the user can advance.

**c. Render thumbnail only when `fileUrl` looks like a real URL**
- Guard the `<img>` and "View photo" button with `uploaded[currentSlot.key].fileUrl?.startsWith('http')` so seeded "Previously uploaded" placeholder rows (which have `fileUrl: ''`) and bare storage paths don't try to render as `<img src="">`.

**d. Minor: drop the orphan-test concern**
- No code change needed; with the reordered flow we never write storage without also writing a DB row, so future uploads can't leave orphans.

### 2. Database / storage cleanup

Use a one-shot SQL migration to remove orphan rows and storage objects created during the failed test runs for operator `ee993ec0-e0a2-4d0f-aa05-6d22eb931405`:

- `DELETE FROM public.operator_documents WHERE operator_id = 'ee993ec0…' AND document_type = 'truck_photos' AND created_at >= '2026-04-24'::date;`
- `DELETE FROM storage.objects WHERE bucket_id = 'operator-documents' AND name LIKE 'ee993ec0…/truck_photos/%' AND created_at >= '2026-04-24'::date;`

(Exact timestamps will be confirmed against `supabase--read_query` results before running, so we don't touch any pre-test legitimate data.)

## Verification steps (after changes ship)

1. Sign in as `marcsmueller@gmail.com`, open Operator Portal → Documents → **Open Truck Photo Guide**.
2. Tap **Start Guide** → take photo 1 (Front).
3. Confirm:
   - Spinner appears, then is replaced by the green "Photo uploaded ✓" card.
   - An inline thumbnail of the photo renders.
   - Header shows "Photo 1 of 10 · **1 uploaded**".
   - The **Next Photo** button is gold and enabled.
4. Tap **Next Photo** → take photo 2 → confirm counter increments to "2 uploaded".
5. Close and reopen the modal → previously uploaded slots remain checked (seed still works on fresh open).
6. Verify in `operator_documents` that exactly one row per upload exists and that no storage orphans remain.

## Files changed
- `src/components/operator/TruckPhotoGuideModal.tsx` (logic + render guards)
- One new SQL migration under `supabase/migrations/` for the orphan cleanup

No other files affected.