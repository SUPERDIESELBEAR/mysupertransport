## Diagnosis (already confirmed)

The driver-facing document flows have a shared bug pattern: async calls to storage and the database don't have timeouts, and their errors are silently swallowed. On a flaky mobile connection this shows as an infinite spinner with no toast — matching the reported behavior.

Concrete offenders:

- `DocumentHub.tsx` — `fetchDocuments`, `fetchAcknowledgments`, `fetchAckCounts` all destructure only `data`, throw away `error`, and never set `loading = false` in a `finally`.
- `OperatorDocumentUpload.tsx` — `handleUpload` (and the two decal upload variants) have no timeout on the storage `upload()` call, so if the network stalls the button spins forever.
- `ContractorPaySetup.tsx` — Stage 9 fetch of the three hub docs added last turn uses the same swallow-errors pattern.

RLS and storage policies were verified against the DB and are not the cause. `driver_documents` returns 6 rows for a signed-in driver.

## What to build

1. **New helper** `src/lib/withTimeout.ts`
   - `withTimeout(promise, ms, label)` — rejects with a friendly `Error` after `ms` if the wrapped promise doesn't settle. Used to wrap storage uploads and long-running fetches.

2. **`src/components/documents/DocumentHub.tsx`**
   - Wrap `fetchDocuments`, `fetchAcknowledgments`, `fetchAckCounts` in `try / catch / finally`.
   - Capture the Supabase `{ data, error }` tuple; if `error` is set, toast a friendly message ("Couldn't load documents. Pull to refresh or check your connection.").
   - `finally { setLoading(false) }` so the skeleton always clears.
   - Add a 15 s `withTimeout` around each query.

3. **`src/components/operator/OperatorDocumentUpload.tsx`**
   - Wrap `supabase.storage...upload(...)` in `withTimeout(..., 60_000, 'Upload')` for `handleUpload`, `handleDecalPhoto`, `handleDecalExtra`.
   - Keep the existing `try/catch` — timeouts now surface as the standard "Upload failed" toast with the friendly message.
   - No change to storage buckets or RLS.

4. **`src/components/operator/ContractorPaySetup.tsx`**
   - Same `try / catch / finally` treatment on the Stage 9 hub-doc fetch added last turn.
   - Toast on failure so the page doesn't sit in a loading state forever.

5. **Friendly error messages only**
   - All toasts use human-readable copy ("Couldn't load documents", "Upload failed — check your connection"). Raw Supabase error strings are never surfaced.

## Verification

- Sim a slow network in DevTools (offline / throttled) and confirm:
  - Document Hub shows the empty state + a toast instead of an eternal skeleton.
  - Onboarding upload button releases in ≤ 60 s with a toast instead of spinning forever.
- Sign in as two different driver accounts, upload a small PDF to each of Form 2290 and Truck Title, confirm the doc appears in the slot with a green check and the correct filename.
- Confirm no raw `Error: ...` text shows in any toast.

## Out of scope

- No changes to storage policies, RLS, or bucket configuration.
- No visual redesign of the Document Hub or upload cards — only error-path behavior.
