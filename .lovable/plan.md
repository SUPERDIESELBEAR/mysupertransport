## Goal

Make "Save Progress" actually persist on every click, autosave silently in the background, warn the applicant before they close the tab with unsaved edits, and bring them back to the furthest step they completed when they return.

## Why the current Save button looks dead

The `applications` table's UPDATE RLS policy requires `auth.uid() = user_id`. The public applicant has no auth session and `user_id` is null, so the very first save inserts a draft row (allowed by the public INSERT policy), but every subsequent save goes through `UPDATE … WHERE id = applicationId` and is silently dropped by RLS — zero rows updated, no error returned, no toast. That is exactly the "no toast, nothing happens" symptom.

## Plan

### 1. Server: make draft saves work for anonymous applicants

Add a `SECURITY DEFINER` RPC `save_application_draft(p_token uuid, p_payload jsonb)` that:

- Looks up the existing draft row by `draft_token = p_token`.
- If none exists, inserts a new draft row (`is_draft = true`, copying fields from `p_payload`, `email` required).
- If one exists AND `is_draft = true` AND `review_status` is not a locked state, updates the allowed columns from `p_payload`.
- Refuses to touch rows that have already been submitted (no `is_draft = true`) — those edits must continue to go through the existing revisions flow.
- Returns `{ id, current_step }`.

Grant `EXECUTE` to `anon` and `authenticated`. This is the same pattern already used by `get_application_by_draft_token`. No change to the existing RLS policies.

### 2. Server: remember where the applicant left off

Add a single column to `applications`:

- `current_step smallint NOT NULL DEFAULT 1` — the furthest step the applicant has validated and advanced past (1–9).

The RPC above accepts `current_step` inside `p_payload` and writes it. `get_application_by_draft_token` already returns `*`, so the client gets it back automatically.

### 3. Client: rewrite `saveDraft` in `src/pages/ApplicationForm.tsx`

- Replace the direct `supabase.from('applications').insert/update` calls with a single `supabase.rpc('save_application_draft', { p_token, p_payload })` call.
- Keep the existing `DRAFT_TOKEN_KEY` localStorage behaviour so the same browser keeps using the same draft row.
- On success, store the returned `id` in `applicationId` and clear a new `isDirty` flag (see §4).
- Loud failure: surface the real error in a toast so this class of bug can't hide again.

### 4. Client: autosave + unsaved-changes tracking

In `ApplicationForm.tsx`:

- Add an `isDirty` ref/state, set to `true` inside `handleChange` and cleared after every successful save.
- Add an autosave effect that fires `saveDraft({ silent: true })` (no success toast) when either trigger happens:
  - **Step change** — inside `goNext` and `goBack`, after updating `step` and before the slide transition, await a silent save. Block navigation only if the save errors; on success continue normally.
  - **30s idle timer while typing** — `setInterval(30_000)` that only fires when `isDirty` is true and no other save is in flight; resets the timer after each successful save.
- Add a `beforeunload` listener that calls `event.preventDefault()` and sets `returnValue` whenever `isDirty` is true, so closing/refreshing the tab triggers the native "Leave site? Changes you made may not be saved" prompt. Remove the listener on unmount and after a successful final submit.

### 5. Client: resume at the furthest validated step

- When `goNext` succeeds validation, compute `nextStep = step + 1` and include `current_step: Math.max(formData.current_step ?? 1, nextStep)` in the next save payload (tracked alongside `formData` as a separate piece of state, not a form field).
- In the draft-load effect, after `setFormData(restored)`, also `setStep(data.current_step ?? 1)` clamped to `[1, 9]`. This satisfies "Furthest validated step."
- Keep the existing "We saved your progress" banner so the applicant knows what happened. Add a small "Resuming at Step X — {label}" line under it.

### 6. Polish

- Tiny saving indicator next to the existing Save button: idle "Save Progress", in-flight spinner, after success show "Saved · just now" that fades over 5s. Driven by `saving` + `lastSavedAt` state.
- Disable the Save button (and skip the timer) when there are no dirty fields, so the UI doesn't lie about saving nothing.
- Leave staff-assisted (`StaffApplicationModal`) and the revisions flow untouched — they have their own auth context and don't hit the RLS bug.

## Technical notes

- Files touched: `src/pages/ApplicationForm.tsx` (client logic), one new migration adding `current_step` and the `save_application_draft` RPC, and a regenerated `src/integrations/supabase/types.ts` (auto).
- No new tables, no policy changes, no edge functions, no edits to the staff or revisions flows.
- The RPC is `SECURITY DEFINER` and scoped by `draft_token` (a UUID kept only in the applicant's localStorage and the resume-email link), so it does not widen access — anyone with the token already controls that draft today via the existing read RPC.

## Verification

1. Open the application as a fresh anonymous user, fill Step 1, click Save Progress — toast shows "Saved · just now"; refresh the tab, draft returns with Step 1 filled.
2. Advance to Step 4 — between steps the silent autosave fires; close the tab, reopen the link, land on Step 4 with all prior data.
3. Edit a field, wait 30s without clicking anything — silent save fires, "Saved · just now" indicator updates.
4. Edit a field and try to close the tab — native browser warning appears. Save, try again — no warning.
5. Submit the application — `beforeunload` listener is removed, success screen shows, localStorage token is cleared as today.
