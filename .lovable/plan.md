

## Yes — the document syncs and is viewable in the Vehicle Hub

The backfill copies the file references over so the same PDF/image shows in the Vehicle Hub history with a working preview eye-icon. No file duplication — both views point at the same stored file.

### How it works after backfill

For each of the 46 existing Binder DOT entries, the new `truck_dot_inspections` row receives:

| Field | Source |
|---|---|
| `certificate_file_url` | copied from `inspection_documents.file_url` |
| `certificate_file_path` | copied from `inspection_documents.file_path` |
| `certificate_file_name` | derived from the file path's basename (e.g. `inspection_2024.pdf`) |

The Vehicle Hub drawer (`FleetDetailDrawer.tsx`) already renders an **Eye** preview button on every DOT history row whenever `certificate_file_path` is present, so the existing files become previewable immediately — no UI changes needed.

### One detail — storage bucket

Operator-uploaded binder files live in the `inspection-documents` bucket; Vehicle Hub normally writes to `fleet-documents`. The previous migration already taught the previewer (`bucketForBinderDoc` in `DocRow.tsx`) how to route by path — and the Vehicle Hub previewer uses the file path the same way, so files originally uploaded through the Inspection Binder remain viewable from the Vehicle Hub side without being re-uploaded or moved.

### Result after backfill

- Vehicle Hub → DOT card shows the latest inspection's countdown.
- Vehicle Hub → DOT history list shows all 46 entries with a working **Eye** preview on each.
- Inspection Binder → unchanged (still shows the same file via its own path).
- Going forward, both new Vehicle Hub additions and operator uploads sync the file in both directions automatically.

### Out of scope

- Re-uploading or moving files between buckets (not necessary).
- Backfilling inspector / location / notes (those fields were never captured by the binder uploads).

