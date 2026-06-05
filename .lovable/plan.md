## What I found

I ran the form end-to-end (state-code dropdown, employment "currently employed", etc.) and it advances cleanly through Steps 1–7. The real applicant complaints come from the **submit** step, not navigation. The audit log shows the smoking gun:

- `bilalleggett@outlook.com` hit `error_code: 23505` on stage `insert_application` **seven times** between 2026-06-03 14:37 and 15:05 (iPhone Safari). The DB has a partial unique index `applications_email_non_draft_unique` on `lower(email) WHERE is_draft IS NOT TRUE`, and this email already had a non-draft (denied) record from 2026-06-02. Every retry was rejected by Postgres.

Two bugs combine to trap the applicant:

### Bug 1 — Step-1 duplicate-email guard is silently bypassed for anonymous users
`ApplicationForm.tsx` calls
```ts
supabase.from('applications').select('id').eq('email', email.toLowerCase()).eq('is_draft', false).limit(1)
```
before advancing past Step 1. But `public.applications` RLS only allows SELECT for `auth.uid() = user_id` or staff — **no anon policy**. The query succeeds with `data: []`, the guard treats that as "no duplicate", and the user proceeds. They only discover the conflict at the very last step.

The guard also does a case-sensitive `.eq('email', …)` against stored data, while the unique index normalizes with `lower()`. Any historic row stored with mixed case would slip past even if anon SELECT were allowed.

### Bug 2 — Submit error surfaces as "[object Object]" and a generic toast
On failure, `ApplicationForm.tsx` shows a generic "We couldn't submit your application — please try again…" toast. The error logger writes `error_message: "[object Object]"` because it stringifies the Supabase error object instead of `.message`. So neither the applicant nor staff can tell why it failed; the user just retries forever.

## Fix

1. **New SECURITY DEFINER RPC `check_application_email_taken(p_email text) returns boolean`** in a new migration. Locked to `anon` and `authenticated`, it does the same `lower(email)` lookup against `is_draft = false` rows. Returns `true` if already submitted.
2. **`ApplicationForm.tsx`** — replace the direct `supabase.from('applications').select(...)` pre-check in `goNext` (step 1) with `supabase.rpc('check_application_email_taken', { p_email })`. Also fall back to blocking on `error` so a network/RPC failure doesn't silently let the user through; show a clear inline message and stop.
3. **Submit-error handling in `ApplicationForm.tsx`** — in the `catch` block of the submit handler:
   - Detect Postgres `code === '23505'` (or message contains `applications_email_non_draft_unique`) and set `setDuplicateEmailBlocked(true)` + scroll to top so the existing "Application already submitted" panel shows, instead of the generic toast.
   - For any other failure, surface `(err as any).message` in the toast instead of the canned text so the applicant has something actionable to report.
4. **`log-application-error` callsite** — pass `err.message` (and `err.details`/`err.hint` when present) instead of `String(err)` so future audit_log rows aren't `[object Object]`.
5. **Staff-side StaffApplicationModal** (`src/components/management/StaffApplicationModal.tsx`) — same 23505 detection so staff entering applications on behalf of someone get a clear "Already submitted by this email" message instead of a generic toast.

No UI redesign, no schema column changes beyond the new RPC. The existing "Application already submitted" block in `ApplicationForm.tsx` (lines ~564–570) is reused as the user-visible result.

## Files touched

- `supabase/migrations/<new>.sql` — create `public.check_application_email_taken(text)` SECURITY DEFINER + `GRANT EXECUTE` to `anon, authenticated`.
- `src/pages/ApplicationForm.tsx` — swap pre-check to RPC, harden the `.then` branch against errors, add 23505 handling in submit catch, pass `err.message` to the error logger.
- `src/components/management/StaffApplicationModal.tsx` — add the same 23505 user-friendly error mapping.
- `public/version.json` — bump.

## Why not also relax the unique constraint?

The partial unique index is the right safeguard against true duplicate submissions. The problem is purely UX: the app must detect the conflict early (RPC) and explain it clearly when it does happen (catch-block mapping). No DB constraint changes.
