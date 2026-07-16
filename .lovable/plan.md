## What I found

Jonathan Grant's records are correct:

- `profiles.user_id` = `c5993805…`, name matches
- `operators` row `396c1e54…` exists with `user_id` = `c5993805…`
- Roles: `operator` + `truck_owner`
- No existing storage objects or `operator_documents` rows for him yet

The truck photo upload writes to `operator-documents/{operatorId}/truck_photos/…`. The storage RLS `INSERT` policy requires the first path segment to be in `SELECT operators.id FROM operators WHERE user_id = auth.uid()`. I ran that check against his actual IDs and it returns `true`. So the policy itself is not misconfigured — the failure is that at the moment of the upload his request is reaching PostgREST/Storage **without a live `auth.uid()`** (expired/stale JWT, or the client fell back to the anon key).

That matches the symptom exactly: the toast title `Upload failed` + literal Postgres string `new row violates row-level security policy` comes from `storage.objects` when `auth.uid()` is `NULL`. Terry Melancon hit the same class of issue on applicant uploads a few weeks ago; the truck-photo flow was never given the same defensive treatment.

## Fix plan

Harden the operator-side upload paths so a stale session self-heals instead of throwing a red RLS toast. No RLS or bucket changes — the policies are correct.

1. **`src/components/operator/TruckPhotoGuideModal.tsx`** — before the storage `upload()` call:
   - `await supabase.auth.getSession()`; if missing or `expires_at` within 60s, call `supabase.auth.refreshSession()`.
   - If still no session, show a friendly `Session expired — please sign in again` toast (not the raw RLS string) and stop.
   - Wrap the upload + `operator_documents` insert in a small retry: on the first failure whose message contains `row-level security` or `JWT`, call `refreshSession()` once and retry the upload one time.
   - On final failure, log `[TruckPhotoGuide] upload failed` with `{ operatorId, authUid: session?.user?.id ?? null, pathPrefix }` so future reports are diagnosable in the console the user pastes back.

2. **`src/components/operator/SmartProgressWidget.tsx`** (`InlineDocUpload.handleUpload`) — apply the same session-refresh + one-shot retry helper so the Progress-widget inline upload behaves identically.

3. **`src/lib/uploadWithAuth.ts`** (new) — extract the pre-upload session check + retry wrapper into one helper so both call sites (and any future operator upload) share the exact same behavior. Signature roughly `uploadToBucket(bucket, path, file, options)` returning the same `{ data, error }` shape as `supabase.storage…upload`.

4. **No DB migration.** RLS policies for `operator-documents` and `operator_documents` are already correct — verified by simulating the policy predicate against Jonathan's real IDs.

### What this changes for the user

- If Jonathan's session was silently stale, the next tap on **Tap to Take Photo** transparently refreshes his token and the upload succeeds.
- If his session is truly gone, he sees a clear "please sign in again" prompt instead of a scary RLS error.
- The console log gives us the exact `authUid` at the moment of failure so we can tell "session expired" from "wrong operator row" if it ever recurs.

### Technical notes

- `supabase.auth.refreshSession()` is safe to call on every tap because Supabase short-circuits when the token is still valid.
- The retry is capped at 1 attempt to avoid masking a real permission bug.
- Existing `withTimeout(...)` wrapper stays; the new helper composes on top of it.
- No changes to storage bucket config, RLS policies, or `operator_documents` schema.
