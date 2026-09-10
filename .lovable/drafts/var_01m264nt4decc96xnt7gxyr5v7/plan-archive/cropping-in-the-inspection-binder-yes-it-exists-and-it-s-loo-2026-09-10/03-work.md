# Part 1 — the crop fix

1. Make the location resolver trust the saved link first. When a binder document already has a working link, read the storage area and file path straight out of it, rather than inferring from the path text.
2. When there is no link, strip a leading storage-area word (`fleet-documents/`, `applications/`, and similar) off the path before using it, and pick the area from that word.
3. Use that one resolver everywhere the pencil is offered — the binder list, the full-screen viewer, and the flipbook — so the same document behaves the same way in all three.
4. After a crop is saved, keep writing the new link back to the binder row exactly as today, so the viewer refreshes.

No document data is rewritten and no records are deleted by this part. The 87 mismatched rows are left as they are; the app simply stops being confused by them.

## Technical notes

- `bucketForBinderDoc` in `src/components/inspection/DocRow.tsx` returns `fleet-documents` for any `file_path` starting with `fleet-documents/` and never strips the prefix, so `supabase.storage.from(bucket).download(path)` misses on both counts. Live: 87 of 772 `inspection_documents` rows are prefixed; 78 resolve to `inspection-documents` and 9 to `operator-documents` by their `file_url`. Delease's row `4c7a0f92-faec-488e-b6eb-1e4eedb0f28b` points at object `driver/da4baf8e…/periodic-dot-inspections/1783980146633.jpeg` in `inspection-documents`.
- Add a shared helper `resolveBinderStorage(file_url, file_path)` that parses `/object/sign/<bucket>/<path>` from the URL, falls back to prefix stripping, and returns `{ bucket, path }`. Replace the `bucketForBinderDoc` call sites in `InspectionBinderAdmin.tsx` and `DocRow.tsx`.
- Unit tests: prefixed path plus inspection URL, prefixed path plus operator URL, clean path with no URL, and the Vehicle Hub `<uuid>/dot/…` shape that must stay on `fleet-documents`.
