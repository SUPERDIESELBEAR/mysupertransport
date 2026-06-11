## What's happening to Emma's application

Emma's record exists in the database, but it's still flagged as a draft:

- `is_draft = true`, `submitted_at = null`
- `user_id = null` (she filled out the form as an anonymous applicant — the normal path)
- She did finish every step: signature, typed name, and signed date are all saved
- The "new driver application" email to staff *did* go out

So why is the dashboard empty? The dashboard's Applications list only shows rows where `is_draft = false`. Emma's row never flipped.

## Root cause

The Application Form's **Submit** handler writes directly to the `applications` table with `supabase.from('applications').update(...)`. The row-level security policy for that update is:

```
auth.uid() = user_id  AND  is_draft = true
```

Anonymous applicants have no `auth.uid()` and no `user_id` on the row, so the policy filters the row out. PostgREST returns success with **zero rows updated** and **no error** — so the client code:

1. Thinks the submit succeeded
2. Fires the "new application received" email to staff (which is what you saw)
3. Shows the applicant a success screen
4. Leaves the row as `is_draft = true` forever

Every step *before* Submit goes through a SECURITY DEFINER function (`save_application_draft`) that bypasses RLS, which is why all her draft data is intact. Only the final Submit step is broken.

This is a latent bug that affects every anonymous applicant. It may have started showing up only recently if applicants previously had `user_id` set, or if a prior RLS policy was broader.

## Fix

### 1. New SECURITY DEFINER RPC `submit_application_draft`

- Inputs: `p_token uuid`, `p_payload jsonb`, `p_ssn_encrypted text`
- Looks up the row by `draft_token`
- Requires `is_draft = true` (so resubmits are rejected) and email matches payload
- Writes every column the current client payload writes (mirrors `buildPayload`), plus `is_draft = false`, `submitted_at = now()`, `review_status = 'pending'`
- Re-uses the same array-safe guards we added to `save_application_draft` for `endorsements` / `equipment_operated`
- Raises `not_found` if no row matches the token, so the client can show a real error instead of silently succeeding
- Returns the row id

### 2. Update `ApplicationForm.tsx` Submit handler

- Replace the direct `.update()` / `.insert()` block with a call to `supabase.rpc('submit_application_draft', { p_token, p_payload, p_ssn_encrypted })`
- Only fire the "new application" notification email **after** the RPC returns a row id (no more silent success → bogus email)
- Keep the duplicate-email detection (the RPC will raise `applications_email_non_draft_unique`-style errors the same way)

### 3. Recover Emma's record

Flip her existing row to submitted so it appears in the Applications dashboard immediately, without making her redo the form:

```text
applications.id = a7a1fb75-7e87-4c24-a300-b3f71156ee6b
  is_draft       → false
  submitted_at   → 2026-06-11 15:12:52 UTC  (her last save timestamp)
  review_status  → pending
```

This will be applied as a one-time data migration.

### 4. Verification

- Re-check Emma's row: `is_draft = false`, `submitted_at` set, visible in dashboard
- New anonymous applicant test: fill the form end-to-end, click Submit → row flips to submitted, email fires once, applicant sees success screen
- Negative test: tamper with `draft_token` → RPC raises `not_found`, client shows the error toast instead of a fake success

## Files touched

- New migration: create `public.submit_application_draft(uuid, jsonb, text)` RPC
- One-time data fix in the same migration for Emma's row
- `src/pages/ApplicationForm.tsx` — swap direct update/insert for the RPC and gate the email on real success

## Out of scope

- No UI/copy changes
- No changes to staff-assisted submit (`StaffApplicationModal`) — staff users pass RLS via `is_staff`, so it already works
- No changes to draft auto-save behaviour
