

## Fix: Patch Broken Truck Photo Records

### What happened
The two photos Marcus Mueller uploaded were taken **before the latest code fix deployed to his device**. The old code attempted to store a signed URL (which resolved to empty string) instead of the raw storage path. The files themselves uploaded successfully to storage — only the database records have empty `file_url` values.

The current code is correct and will work for future uploads. We just need to fix the two existing broken records.

### Plan

**1. Patch the two broken database records via migration**

Update the `file_url` column for the two records that have empty values, using the actual storage paths confirmed in the storage bucket:

| Record ID | Storage Path |
|-----------|-------------|
| `bf740744-8668-47d2-9fb6-a3213e7a20b2` | `ee993ec0-e0a2-4d0f-aa05-6d22eb931405/truck_photos/truck_photos_front_1776038829082.jpg` |
| `8e34244c-9359-433c-ab4f-3ca8beba3e08` | `ee993ec0-e0a2-4d0f-aa05-6d22eb931405/truck_photos/truck_photos_front_1776036696044.jpg` |

**2. No code changes needed**

The upload code (`TruckPhotoGuideModal.tsx` line 153) already correctly stores the raw path. The staff grid (`TruckPhotoGridModal.tsx`) already handles raw paths and generates signed URLs on-demand. Future uploads will work correctly.

### Files Modified
| File | Change |
|------|--------|
| Database migration | Patch 2 records with correct `file_url` values |

