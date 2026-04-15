

## Fix Memory Limit for Large Driver's License Images

### Problem
Ronald Lockett's driver's license image is too large for the edge function's memory limit (~150MB). Even with the optimized `base64Encode`, downloading and encoding a multi-megabyte photo phone image exceeds the limit. Bobby Thompson's works because his file is smaller.

### Solution
Add a file size check before downloading. If the file exceeds a safe threshold (e.g. 4MB), generate a **time-limited signed URL** (7-day expiry) instead of attaching the file. The email template will adapt — showing "Driver's license attached" when small enough to attach, or a clickable link when too large.

### Changes

**`supabase/functions/send-insurance-request/index.ts`**

1. **Before downloading**, call `supabase.storage.from(bucket).list()` on the parent folder to get the file's `metadata.size`, or attempt download and check `arrayBuffer.byteLength`.

2. **If the file is ≤ 4MB** — proceed with the current attach flow (download → base64Encode → Resend attachment).

3. **If the file is > 4MB** — skip the download entirely. Instead, generate a signed URL with `createSignedUrl(filePath, 604800)` (7 days). Pass the URL to the email template as a clickable link.

4. **Update `buildInsuranceEmail`** to accept a new optional `dlSignedUrl` parameter. When present (and `dlAttached` is false), render a "View Driver's License" link. When neither is available, show "No driver's license on file."

### Technical Detail
The simplest approach: attempt the download, then check `arrayBuf.byteLength` before encoding. If it exceeds 4MB, discard the buffer immediately and fall back to the signed URL. This avoids an extra API call to list metadata.

```typescript
const arrayBuf = await fileData.arrayBuffer();
if (arrayBuf.byteLength > 4 * 1024 * 1024) {
  // Too large to attach — fall back to signed URL
  const { data: signedData } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 604800); // 7 days
  dlSignedUrl = signedData?.signedUrl ?? null;
} else {
  const bytes = new Uint8Array(arrayBuf);
  dlBase64 = base64Encode(bytes);
}
```

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Add size check, signed URL fallback, update email template |

