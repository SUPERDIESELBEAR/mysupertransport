# Fix "Edge Function returned a non-2xx status code" on Passenger Authorization submit

## What we know
- `PassengerAuthSign.tsx` calls `supabase.functions.invoke('finalize-passenger-auth', …)` on submit.
- The database shows the latest three records for Marcus Mueller are all still in `sent` / `opened` — none reached `signed`, confirming finalize is failing before the row update.
- `finalize-passenger-auth` has **no log entries at all** — strongly suggests the function is not currently deployed (or its last deploy failed), which would produce exactly the non-2xx error the driver sees.
- The other two functions in the trio (`send-passenger-auth`, `get-passenger-auth`) are working; only `finalize-passenger-auth` is silent.

## Plan

1. **Redeploy `finalize-passenger-auth`** to ensure the current `supabase/functions/finalize-passenger-auth/index.ts` is live. This is the most likely fix.
2. **Trigger a real submit** from the preview using the pending Marcus Mueller record and check `edge_function_logs` for `finalize-passenger-auth`. If it now returns 2xx, we're done.
3. **If it still fails**, read the returned error body and address the specific cause. Likely candidates already vetted in the code:
   - `operator_documents.document_type` uses enum `operator_doc_type`; `'other'` is a valid value — OK.
   - `passenger-auth-executed` and `passenger-auth-signatures` buckets exist (private) — OK; service-role client bypasses RLS for uploads.
   - Large base64 payload (PDF + 2–3 signature PNGs) could exceed the request body limit. If logs show a size/413 error, switch the client to upload the signature PNGs and PDF directly to storage first (using signed upload URLs minted by finalize) and then post just the paths to the function.
4. **Confirm** with a fresh submit that:
   - The row transitions to `filed`,
   - The executed PDF appears in the driver's Driver Hub (`operator_documents`),
   - The success screen renders in the app.

## Technical notes
- No schema changes expected.
- If a payload-size fix ends up being required (step 3 fallback), it will be a small refactor: add a `create-passenger-auth-upload-urls` action (or extend finalize with a `mode: 'prepare'` branch), and have `PassengerAuthSign.tsx` PUT files directly to storage before calling finalize with only paths.
