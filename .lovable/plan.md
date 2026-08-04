# Fix: "Send email" on roadside document share spins forever

## What's happening

The Send email button calls the `send-binder-share` backend function. Checks just run:

- The function is deployed and answers instantly (a bad request comes back in ~1.4s with a clear error).
- There is **not a single row** in the email send log for `binder_document_share` — so no attempt has ever reached the mail provider.
- No error entries exist in the function's logs, only boot events.

So the request enters the function and stalls before it ever tries to send. The function currently loops over documents **one at a time**, and for each one does a database lookup plus a separate short-link call. For a full binder (9+ documents) that is 20+ sequential round trips, any one of which can stall with no timeout and no logging — and the button has no timeout either, so it spins indefinitely with nothing surfaced to the driver.

## The fix

1. **Client can no longer hang silently** (`src/components/inspection/BinderFlipbook.tsx`)
   - Wrap the call in the existing `withTimeout` helper (45s). On timeout, stop the spinner and show a real error toast with the "Use my mail app instead" fallback still available.
   - Read the detailed error text the backend returns so the toast says what actually failed instead of a generic message.

2. **Remove the slow sequential work** (`supabase/functions/send-binder-share/index.ts`)
   - Fetch **all** selected documents in one query (single `in(...)` lookup on the share tokens) instead of one query per document.
   - Generate the short links in parallel, each with a short per-link timeout; if a link can't be shortened in time, fall back to the full link rather than blocking the whole email.
   - Add step-by-step logging (auth ok, N docs resolved, links built, send result) so any future stall is visible in the logs immediately.
   - Return a clear error if resolution takes too long overall, instead of hanging.

3. **Verify end to end**
   - Confirm a send produces a `sent` row in the email send log and the recipient gets the branded message.

No changes to the email design, the document list, or the mail-app fallback.

## Technical notes

- Mail credentials are configured, so this is not a missing-key problem.
- Document authorization rules stay exactly as they are (staff can share any binder; a driver only their own); the single batched query applies the same scope checks over the fetched rows.
