

## Fix: "Row violates row-level security policy" on Document Editor Save

### Root Cause
The `application-documents` storage bucket has INSERT and SELECT policies but **no UPDATE policy**. When the document editor saves a cropped image, it calls `supabase.storage.upload()` with `upsert: true`. Upsert requires an UPDATE policy on `storage.objects` for the target bucket. Since no UPDATE policy exists, the operation fails with the RLS violation error shown in the screenshot.

### Fix
Create a database migration that adds an UPDATE policy for staff users on the `application-documents` bucket:

```sql
CREATE POLICY "Staff can update application documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'application-documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'application-documents' AND public.is_staff(auth.uid()));
```

This allows authenticated staff members to overwrite files in the `application-documents` bucket when saving edited documents, while keeping the bucket secure from non-staff modifications.

### Files changed
| File | Change |
|------|--------|
| New migration SQL | Add UPDATE storage policy for `application-documents` |

No code changes needed — the editor logic is correct; it just needs the storage permission.

