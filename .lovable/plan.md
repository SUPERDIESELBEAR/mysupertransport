

## Fix Flipbook: CDL/Medical/etc. not rendering for many drivers

### Root cause (verified against DB)

The Inspection Binder's per-driver docs get auto-populated from the application by `supabase/functions/invite-operator/index.ts` (lines 238–265). It copies `app.dl_front_url`, `app.dl_rear_url`, and `app.medical_cert_url` straight into `inspection_documents.file_url`.

**Problem:** Those source values aren't full URLs — they're bare relative paths like `applications/1774892583625_86i6uhypr6q.jpg` (from the application-documents storage bucket).

When `BinderFlipbook` does `<img src="applications/...">` or `pdfToImage("applications/...")`, the browser resolves these relative to the current page (e.g. `/dashboard/applications/...`) → 404 → blank/error in the flipbook. Same reason these wouldn't render in `Eye` preview either.

**Scope (verified via DB):**
- 76 of 309 per-driver docs (~25%) have broken bare paths
- Affects only: `CDL (Front)` (25), `CDL (Back)` (26), `Medical Certificate` (25)
- Affects 26+ drivers including Ronald Lockett (`6b2a1a67-…`)
- `Periodic DOT Inspections`, `Lease Agreement`, `IRP Registration` are stored as proper signed URLs and render fine — Ronald's Periodic shows fine in the DB; if the user reported it failing too it's because it sits next to the broken slots in the same flipbook session and visually conflates

### The fix — two parts

**Part 1: Backfill the 76 broken rows (one-time SQL migration)**

The bare paths point into the `application-documents` bucket. We generate a fresh long-lived signed URL for each broken row and overwrite `file_url` + populate `file_path`.

Approach: a small migration that, for every `inspection_documents` row where `file_url LIKE 'applications/%'`:
1. Sets `file_path = file_url` (the bare path is already a valid storage path within `application-documents`)
2. Calls `storage.create_signed_url('application-documents', file_path, 5_years)` and writes the result to `file_url`

Since SQL can't directly call storage signing, the cleanest pattern is a tiny one-shot edge function (`backfill-binder-urls`) that:
- Selects all `inspection_documents` where `file_url LIKE 'applications/%'`
- For each: `supabase.storage.from('application-documents').createSignedUrl(file_url, 60*60*24*365*5)`
- Updates the row with the new `file_url` and sets `file_path` to the original bare path
- Returns counts. Idempotent (only touches `applications/%` rows).

We invoke it once after deploy from the Lovable Cloud function tester or a tiny admin button.

**Part 2: Fix the source so future invites don't repeat the bug**

In `supabase/functions/invite-operator/index.ts` (lines 238–265), before inserting the three doc rows, generate a signed URL from the bucket `application-documents` for each path and insert that as `file_url`, with `file_path` set to the bare path.

```ts
async function signAppDoc(path: string | null) {
  if (!path) return { url: null, path: null };
  // Already a full URL? leave it.
  if (path.startsWith('http')) return { url: path, path: null };
  const { data, error } = await supabase.storage
    .from('application-documents')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (error) return { url: null, path };
  return { url: data.signedUrl, path };
}
```

Then in each of the three insert blocks:
```ts
const { url, path } = await signAppDoc(app.dl_front_url);
await supabase.from('inspection_documents').insert({
  ...,
  file_url: url,
  file_path: path,
});
```

### Defensive UI hardening (small, optional but recommended)

In `src/lib/pdfToImage.ts` and `src/components/inspection/BinderFlipbook.tsx`'s `<img>` / `pdfToImage` calls, add a tiny resolver that detects bare `applications/` (or any non-http) values and surfaces a clear "Source link broken — please re-upload" message instead of a silent blank. Catches any future drift.

### Files changed

| File | Change |
|---|---|
| `supabase/functions/invite-operator/index.ts` | Resolve `dl_front_url` / `dl_rear_url` / `medical_cert_url` to signed URLs before insert; populate `file_path` |
| `supabase/functions/backfill-binder-urls/index.ts` | **New** one-shot fixer that re-signs the 76 broken rows |
| `src/lib/pdfToImage.ts` | Throw a clear "Document source not accessible" error if URL doesn't start with `http(s)` |
| `src/components/inspection/BinderFlipbook.tsx` | Render the bad-source case with a helpful "Please re-upload this document" panel + link to the staff binder tab |

### What you'll do after deploy
1. I deploy the changes (auto)
2. You hit "Run" once on `backfill-binder-urls` (or I trigger it via the function tester)
3. Open Ronald Lockett's flipbook — CDL Front, CDL Back, Medical Cert, and Periodic DOT all render

### Why this is safe
- Backfill function only touches rows where `file_url LIKE 'applications/%'` — fully scoped
- Idempotent: re-running just re-signs (still works)
- Existing good rows (full URLs, signed `inspection-documents` URLs) are untouched
- No schema changes; only data updates
- UI hardening fails gracefully — replaces silent blanks with actionable messages

