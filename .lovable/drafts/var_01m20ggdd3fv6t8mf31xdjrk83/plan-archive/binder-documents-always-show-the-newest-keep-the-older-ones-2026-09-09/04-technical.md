## Technical notes

**Root cause.** `sync_dot_to_inspection_documents()` sets `file_url = COALESCE(NEW.certificate_file_url, file_url)`. Vehicle Hub inspection uploads persist `certificate_file_path` only (`<operator_uuid>/dot/<file>` in `fleet-documents`) with a NULL `certificate_file_url`, so the binder keeps the previous signed URL while `file_path` moves on. `DocRow` renders `doc.file_url`, hence the stale document.

Second defect: the same function writes `v_file_path := 'fleet-documents/' || NEW.certificate_file_path`. `bucketForBinderDoc()` (`src/components/inspection/DocRow.tsx:29`) matches on a leading UUID, so the prefixed value falls through to `inspection-documents` — the wrong bucket. 90 of 94 rows carry the prefix; 6 currently mismatch their `file_url`.

**Schema (staged additive migration, applies on accept).**
- `inspection_document_versions`: `id`, `document_id` → `inspection_documents(id) on delete cascade`, `version int`, `file_path text`, `file_url text`, `expires_at date`, `uploaded_by uuid`, `uploaded_at timestamptz`, `source text` (`staff_replace` / `driver_upload` / `vehicle_hub_sync` / `onboarding_sync`), unique `(document_id, version)`, index on `document_id`.
- GRANTs: `SELECT, INSERT` to `authenticated`; `ALL` to `service_role`; no `anon`.
- RLS: staff (`is_staff(auth.uid())`) full read/insert; operators read rows whose parent document `driver_id = auth.uid()`; no update/delete policies (append-only), plus an immutability trigger.
- `archive_inspection_document_version()` BEFORE UPDATE trigger on `inspection_documents`: when `file_path` or `file_url` changes and OLD had a file, insert the OLD pair as the next version.
- Replace `sync_dot_to_inspection_documents()`: write `NEW.certificate_file_path` unprefixed, and set `file_url` from the new certificate (regenerate/clear rather than COALESCE) so link and location never diverge.

**Data repair (run_sql, after accept).** Strip the `fleet-documents/` prefix across the 90 rows; for the 6 mismatched rows set `file_url` from the true `certificate_file_url` of the latest `truck_dot_inspections` row (or NULL so the viewer signs from `file_path`); backfill version 1 for every existing binder document.

**UI.**
- `DocRow.tsx` — add a `History` action beside View/Replace, listing versions and opening each in `FilePreviewModal` via `bucketForBinderDoc`. Keep `bucketForBinderDoc` tolerant of a legacy `fleet-documents/` prefix.
- `FleetDetailDrawer.tsx` — DOT inspection rows already list every inspection; ensure each row's eye resolves its own certificate bucket.
- Driver Hub / operator document panels — reuse the same history component keyed by `inspection_documents.id`.
