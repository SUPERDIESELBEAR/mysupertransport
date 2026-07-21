## What's happening

On the Dispatch Board, the **Decals** button lights up whenever the driver's `onboarding_status` row has any decal URL stored (`decal_photo_ds_url`, `decal_photo_ps_url`, or entries in `decal_photos`). Hafeezullah Awal Khan's button is dull because none of those fields are set for him yet — that's correct.

For the other drivers the button is lit but no images appear. I checked the stored URLs and found the real problem: the values in the database are **not durable storage paths**. They are one of:

- `/storage/v1/object/sign/operator-documents/…` — short-lived signed URLs. Once the signature expires (typically 1 hour to 7 days from creation), the URL returns 400/403 and the `<img>` renders blank.
- `/storage/v1/object/public/operator-documents/…` — but the `operator-documents` bucket is **private**, so these public URLs also fail.

`DecalPhotosQuickView` drops these strings straight into `<img src>`, so once they go stale the modal shows empty tiles and the PreviewLink modal fails too.

So those drivers do have decal photos uploaded — the app just can't reach them anymore.

## Fix

Mint a fresh signed URL at click time from the underlying storage path, instead of trusting the URL stored in the DB.

### Steps

1. **Add a helper** `resolveDecalUrl(storedUrl)` (small util, e.g. `src/lib/decalUrl.ts`): given any of the three URL shapes we've stored, extract the object path after `operator-documents/` and call `supabase.storage.from('operator-documents').createSignedUrl(path, 3600)`. Return the fresh signed URL. Pass through unchanged if it isn't a Supabase storage URL (defensive).
2. **Update `DecalPhotosQuickView`** to hold `{ ds, ps, extras }` in local state, resolve all URLs in a `useEffect` when `open` flips true, and show a small loading state while resolving. On per-tile failure, show the existing "Not uploaded" placeholder plus a subtle "File missing" caption so staff can tell the difference.
3. **Leave the lit/dull button logic unchanged** in `DispatchPortal.tsx` — the presence check is still correct; only the render inside the modal needs the signed-URL resolution.
4. **Verify** by opening the modal for a couple of drivers whose stored URLs are `/sign/…` (e.g. Steve Figueroa, Rudolph Ellis) and confirming images now load. Confirm Hafeezullah's button remains disabled with the existing tooltip.

### Technical notes

- No schema change and no migration. Read-side rendering fix only.
- Follow-up hygiene (not in this fix): the writer that saves decal photos should store the **object path** (e.g. `"<operator_id>/decal_photos/ds_1778.jpg"`), not a signed/public URL. Then the resolver can skip URL-parsing entirely. We can do that in a later pass once this render fix is in.
- Files touched:
  - `src/components/dispatch/DecalPhotosQuickView.tsx` (resolve on open, loading/error state)
  - new `src/lib/decalUrl.ts` for the resolver