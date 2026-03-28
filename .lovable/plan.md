

## Fix: Missing Signature, SSN, and Attachments for Orlando's Application

### Root Cause Analysis

Three separate issues, all related to the fact that applicants submit the form **anonymously** (no auth session):

1. **SSN not stored**: The `encrypt-ssn` edge function requires an authenticated user (`getUser()` check on line 56). Anonymous applicants hit a 401, so `ssn_encrypted` is never saved. The client code silently falls back to `null`.

2. **Signature not visible**: The `signatures` bucket is private. The upload code uses `getPublicUrl()` which generates a URL pattern, but private buckets reject unauthenticated GET requests. The `<img>` tag in the review drawer can't load the image.

3. **DL/Medical Cert attachments not visible**: Same issue — `application-documents` bucket is private, and `getPublicUrl()` URLs don't work for private buckets.

### Fix Plan

**1. `supabase/functions/encrypt-ssn/index.ts`** — Allow anonymous callers
- Remove the `getUser()` authentication check. This function only encrypts a string — it doesn't access any user data or protected resources. The anon key authorization header is sufficient.
- Keep the `Authorization` header requirement (anon key) to prevent fully unauthenticated calls.

**2. `src/components/management/ApplicationReviewDrawer.tsx`** — Use signed URLs for private bucket files
- For `signature_image_url`, `dl_front_url`, `dl_rear_url`, and `medical_cert_url`: extract the storage path from the URL and use `supabase.storage.from('bucket').createSignedUrl(path, 3600)` to generate time-limited signed URLs.
- Load these on drawer mount via a `useEffect`, replacing the raw public URLs with signed ones.
- This works because reviewers are authenticated staff/management with valid sessions.

**3. `src/components/application/Step7Documents.tsx`** — Fix upload URL storage
- Instead of storing the `publicUrl` from `getPublicUrl()`, store just the **storage path** (e.g., `applications/1234_abc.jpeg`). This makes it straightforward to generate signed URLs later.
- This only affects future uploads. Existing data already has full URLs that we'll parse in the drawer.

**4. `src/components/application/Step9Signature.tsx`** — Same path-only storage fix
- Store just the path instead of the public URL for signature uploads.

### Orlando's Existing Data

- His file URLs and signature URL are already in the database with valid paths embedded in the full public URL. The drawer fix (signed URL generation) will extract the path portion and create working signed URLs.
- His SSN is permanently missing (was never encrypted). He would need to resubmit or have it entered manually. We can note this but there's no automatic fix for already-lost data.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/encrypt-ssn/index.ts` | Remove `getUser()` auth gate; allow anon-key callers |
| `src/components/management/ApplicationReviewDrawer.tsx` | Generate signed URLs for signature/attachments on mount |
| `src/components/application/Step7Documents.tsx` | Store storage path instead of public URL |
| `src/components/application/Step9Signature.tsx` | Store storage path instead of public URL |

### Security Notes
- The encrypt-ssn function only performs encryption with a server-side key — removing the user check is safe since no data is read or modified.
- Signed URLs expire after 1 hour, limiting exposure of private documents.
- Future uploads storing paths instead of public URLs is cleaner and more secure.

