## Current state (verified)

- `supabase/functions/send-dot-consultant-request/index.ts` has `const RECIPIENT_EMAIL = 'tracey@iondot.net'` and always sends `to: [RECIPIENT_EMAIL]`. The client can only pass `cc_emails`, so the To line is hardcoded and cannot be changed or removed today.
- Stage 7's insurance email already uses the pattern we want: a single-row `insurance_email_settings` table (`recipient_emails text[]`, staff-only read/update) loaded into the panel and editable/saveable from the card.

## Goal

Mirror the Stage 7 pattern for the DOT consultant email: a saved default recipient list (pre-filled with Tracey) that management can change once, plus the ability to edit the To list for an individual send.

## Plan

1. **Database** — new single-row table `dot_consultant_email_settings` with `recipient_emails text[]`, `updated_at`, `updated_by`; grants + RLS mirroring `insurance_email_settings` (staff read, staff update), seeded with `tracey@iondot.net`.

2. **Edge function** (`send-dot-consultant-request`)
   - Remove the hardcoded To. Load `recipient_emails` from the settings row as the default.
   - Accept an optional `to_emails` array from the client; validate, lowercase, dedupe, cap (15). If provided and non-empty, use it; otherwise fall back to the saved defaults.
   - Error 400 if the resulting To list is empty.
   - Keep CC handling; exclude any address already in To.
   - Update the audit log metadata and the `sent_to` response to use the resolved recipient list instead of the constant.

3. **Stage 8 card UI** (`src/pages/staff/OperatorDetailPanel.tsx`)
   - Load saved DOT recipients alongside the existing insurance settings load.
   - Add a "To" recipient chip editor above the existing CC editor, pre-filled from the saved list and editable per send.
   - Add a "Save as default" action (same behavior as the insurance recipients save) that writes back to the settings table.
   - Pass `to_emails` in the `functions.invoke` body; keep the button label and success toast, showing the actual recipients returned.

4. **Copy** — replace the hardcoded "Tracey" name in the card heading/button with the saved primary recipient's label where it is user-facing, defaulting to "DOT Consultant" if the list is customized. The email body greeting stays generic ("Hi," / recipient name from settings) so it doesn't say Tracey when sent elsewhere.

5. **Deploy** the edge function after the changes.
