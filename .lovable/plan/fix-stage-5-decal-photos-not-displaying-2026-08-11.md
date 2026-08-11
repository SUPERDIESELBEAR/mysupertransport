# Fix Stage 5 Decal Photos Not Displaying

## What's happening

The upload itself works — the photo is saved correctly. The problem is only in how Stage 5 tries to show it.

Decal photos live in a private storage area, so they can only be viewed through a temporary, freshly-signed link. What gets saved on the driver's record is just the file's internal location, not a viewable web link.

Every other place in the app that shows decal photos (the Dispatch Board quick view and the driver's own upload screen) converts that internal location into a viewable link before rendering. The Stage 5 editor is the one place that skips that step and points the image tag straight at the raw internal location — so the browser has nothing to load and shows the broken-image icon with the alt text ("Decal — Driver Side"), exactly as in the screenshot.

## The fix

In the Stage 5 decal photo section:

- Resolve each photo (driver side, passenger side, and every added angle) into a fresh viewable link before displaying it, using the same helper the rest of the app already uses.
- Re-resolve right after a new upload so the thumbnail appears immediately instead of staying broken until a page refresh.
- Show a small loading placeholder while a link is being generated.
- If a photo's file is genuinely missing or can't be signed, show a clear "Photo unavailable" tile instead of a broken image icon.
- Pass the resolved link (not the raw location) to the click-to-enlarge preview so the full-size view opens correctly too.

Older records that stored full links still work — the helper passes those through unchanged.

## Technical notes

- File: `src/components/staff/StaffDecalPhotoEditor.tsx`.
- Use `resolveDecalUrl` from `src/lib/decalUrl.ts` (already handles bare paths, bucket-prefixed paths, stale signed URLs, and non-Supabase URLs).
- Add local resolved-URL state keyed by the stored value, resolved in an effect over `decalPhotoDsUrl`, `decalPhotoPsUrl`, and `decalPhotosExtra`; guard against out-of-order resolution.
- Render `<img>` and `PreviewLink` from the resolved URL only; a `null` result renders the unavailable tile.
- No database or storage changes; upload continues storing the bare path.