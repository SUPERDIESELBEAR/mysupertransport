

## Fix CDL / Medical Certificate Preview — Signed URL Resolution

### Root Cause

The `createSignedUrl` call succeeds (the preview modal opens), but the returned signed URL is likely a relative path (`/storage/v1/object/sign/application-documents/...`) rather than an absolute URL. The `FilePreviewModal`'s blob fetch fails because it tries to fetch from the app's own origin, and the "Open in new tab" link is intercepted by the SPA router, showing the app's 404 page (not a server 404).

The `resolveDocumentUrl` function inside `DocRow.tsx` does handle `/storage/v1/` paths, but the issue is that the signed URL structure uses `/storage/v1/object/sign/...` — which does match the check. However, there may be an edge case where the URL format doesn't match expectations.

### Fix

In `OperatorDetailPanel.tsx`, explicitly resolve the signed URL before passing it to the preview modal — prepend the Supabase base URL if the signed URL is relative.

**File: `src/pages/staff/OperatorDetailPanel.tsx`** (line ~2501-2503)

After `createSignedUrl` returns, check if the `signedUrl` is relative and prepend `VITE_SUPABASE_URL`:

```typescript
const { data } = await supabase.storage
  .from('application-documents')
  .createSignedUrl(path, 3600);
if (data?.signedUrl) {
  let url = data.signedUrl;
  // Resolve relative signed URLs
  if (url.startsWith('/')) {
    const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? '';
    url = `${base}${url}`;
  }
  setStage2Preview({ url, name: doc.label, docType: 'application_doc' });
}
```

This is a one-line defensive fix that matches the same pattern already used in `resolveDocumentUrl` but applied at the source, before the URL ever reaches the preview modal.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Resolve relative signed URLs from `createSignedUrl` before passing to preview modal |

