
## Adding Video Embed Support to the Document Hub

### What exists today
- Documents support two `content_type` values: `rich_text` and `pdf`
- The TipTap rich-text editor has no video support
- `DocumentHubTypes.ts` defines the `DriverDocument` interface
- `DocumentEditorModal.tsx` handles content type switching and saving
- `DocumentViewer.tsx` renders content to operators

### Approach: Add a third content type — `video`

The cleanest way is to add `video` as a third `content_type` alongside `rich_text` and `pdf`. A video embed URL (YouTube or Vimeo) is stored in a new `video_url` column in the database.

**Why URL embed, not file upload?**
- Video files are large (hundreds of MB) — impractical for storage
- YouTube/Vimeo URLs are standard, reliable, and free
- Both platforms support privacy settings (unlisted links)

---

### Changes required

**1. Database migration**
Add a `video_url` column to the `driver_documents` table:
```sql
ALTER TABLE driver_documents ADD COLUMN video_url text;
```
No other schema changes needed — `content_type` is a text field, so it already accepts `'video'` without an enum migration.

**2. `DocumentHubTypes.ts`**
- Add `'video'` to the `content_type` union
- Add `video_url: string | null` to `DriverDocument`

**3. `DocumentEditorModal.tsx`**
- Add a **Video** tab option in the content type selector (alongside Rich Text / PDF)
- When `video` is selected, show a simple URL input field with a paste-and-preview button
- Validate that it's a YouTube or Vimeo URL
- Extract embed URL from standard share links (e.g. `https://youtu.be/abc` → `https://www.youtube.com/embed/abc`)
- Show a live iframe preview of the video in the editor

**4. `DocumentViewer.tsx`**
- Add a `video` branch in the content renderer:
  ```
  isPdf → <iframe PDF>
  isVideo → <iframe YouTube/Vimeo embed, 16:9 aspect ratio>
  rich_text → <dangerouslySetInnerHTML>
  ```
- Show a `🎬 Video` badge in the document header (similar to the PDF badge)
- Keep the acknowledgment footer unchanged — operators still confirm they've watched it

**5. `DocumentCard.tsx` / `AdminDocumentList.tsx`**
- Show a `🎬 Video` badge on cards so operators and staff can distinguish content type at a glance

---

### URL parsing logic (no package needed)

```text
YouTube share:   https://youtu.be/VIDEO_ID
YouTube watch:   https://www.youtube.com/watch?v=VIDEO_ID
→ embed:         https://www.youtube.com/embed/VIDEO_ID

Vimeo:           https://vimeo.com/VIDEO_ID
→ embed:         https://player.vimeo.com/video/VIDEO_ID
```

A simple regex handles both cases cleanly.

---

### Files to change
1. `supabase/migrations/` — new migration to add `video_url` column
2. `src/components/documents/DocumentHubTypes.ts` — add `video` type + `video_url` field
3. `src/components/documents/DocumentEditorModal.tsx` — add video URL input + live preview
4. `src/components/documents/DocumentViewer.tsx` — render embed iframe
5. `src/components/documents/DocumentCard.tsx` — show video badge
6. `src/components/documents/TipTapEditor.tsx` — no change needed (separate content type)
