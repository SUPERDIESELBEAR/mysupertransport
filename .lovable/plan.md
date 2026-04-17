

## Fix Flipbook: Periodic DOT (and other edited docs) not rendering

### Root cause

When staff edit any document in the in-app editor (rotate/crop), `src/components/shared/DocumentEditor.tsx` line 241 generates a **1-hour** signed URL and persists it back to `inspection_documents.file_url`:

```ts
.createSignedUrl(filePath, 60 * 60);  // ← 1 hour, then dead forever
```

The flipbook reads `file_url` directly (no re-signing). After 1 hour the saved URL is permanently expired → image fails silently → flipbook shows nothing.

**Verified for Ronald Lockett's Periodic DOT row**: signed URL has `iat: 1776265922, exp: 1776269522` (1-hour window, expired ~2 days ago).

**Scope**: ~140 `inspection_documents` rows have been edited and now hold stale URLs:
- CDL (Front): 41 · CDL (Back): 40 · Medical Cert: 32 · IRP: 11 · **Periodic DOT: 11** · plus 6 others

This is also why CDL/Medical render for some drivers and not others — only the *edited* ones are broken.

### The fix — three parts

**1. Stop the bleed (1 line)**
`src/components/shared/DocumentEditor.tsx` line 241: change `60 * 60` → `60 * 60 * 24 * 365 * 5` (5 years), matching the rest of the codebase. Future edits will save long-lived URLs.

**2. Backfill the existing broken rows**
Extend the existing `supabase/functions/backfill-binder-urls/index.ts` to also re-sign rows whose URL is expired. Detect by:
- `file_path IS NOT NULL` (we know where it lives)
- AND `file_url` contains a JWT we can decode whose `exp < now` (or simpler: re-sign every row that has a `file_path` and a token-style URL, since re-signing is idempotent and harmless for currently-valid ones)

For each row: `supabase.storage.from('inspection-documents').createSignedUrl(file_path, 5_years)` → write to `file_url`. Keeps the existing `applications/%` branch too so it remains a single one-shot tool.

**3. Defensive: flipbook auto-resigns on render (small, recommended)**
`src/components/inspection/BinderFlipbook.tsx` `PageRenderer`: if `fileUrl` looks like a signed URL but the embedded `exp` claim is in the past, attempt a fresh `createSignedUrl` from `file_path` before giving up. Prevents this exact category of bug from ever surfacing as a blank page again.

To do this cleanly, plumb `filePath` through `FlipbookPage`:

```ts
export interface FlipbookPage {
  // …existing fields
  filePath?: string | null;   // ← new, used for on-the-fly re-signing
  bucket?: string | null;     // ← new (defaults to 'inspection-documents')
}
```

Then `OperatorBinderPanel`, `OperatorInspectionBinder`, and `InspectionBinderAdmin` pass `filePath: doc?.file_path` and `bucket: 'inspection-documents'` when building pages.

Renderer flow:
```
useEffect(fileUrl):
  if expired-looking signed URL && filePath:
     supabase.storage.from(bucket).createSignedUrl(filePath, 5y)
       → setEffectiveUrl(...)
  else:
     setEffectiveUrl(fileUrl)
```

### After deploy

1. I deploy the four file changes
2. I run the updated `backfill-binder-urls` once → re-signs all ~140 broken rows in one shot
3. Open Ronald Lockett's flipbook → Periodic DOT renders. Same for every other affected driver.

### Files changed

| File | Change |
|---|---|
| `src/components/shared/DocumentEditor.tsx` | Use 5-year expiry on save (was 1 hour) |
| `supabase/functions/backfill-binder-urls/index.ts` | Also re-sign rows with `file_path` (extend existing one-shot) |
| `src/components/inspection/BinderFlipbook.tsx` | `FlipbookPage.filePath` field + auto re-sign expired URLs in `PageRenderer` |
| `src/components/inspection/OperatorBinderPanel.tsx` | Pass `filePath` + `bucket` when building flipbook pages |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Same |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Same |

### Why this is safe

- Editor expiry change is a single-token swap; no behavior change beyond URL TTL
- Backfill is idempotent and scoped (`file_path IS NOT NULL`); re-signing valid URLs is harmless
- Flipbook auto-resign is a fallback layer — does nothing for healthy URLs
- No schema changes, no RLS changes, no new dependencies

