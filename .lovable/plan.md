## Stage 8 — Additional email recipients for the DOT consultant email

Add an "Additional recipients (CC)" chip input to the Stage 8 "Email Tracey McQuilken" panel so staff can send copies to themselves or other people on a per-send basis. Also remove the word "optional" from the "Notes to Tracey" label.

### Scope

- Frontend only for the label change.
- Frontend + one edge function for the CC feature.
- Do NOT reuse the persistent `insurance_email_settings` pattern — Stage 8 CCs are ad-hoc per send (not saved), matching the user's "if staff chooses to do so" framing.

### Changes

**`src/pages/staff/OperatorDetailPanel.tsx`**

1. Change label text `Notes to Tracey (optional)` → `Notes to Tracey`.
2. Add local state:
   - `dotCcEmails: string[]`
   - `dotCcInput: string`
3. Above the "Attachments" block, add a "CC (optional)" section styled like the Stage 7 insurance recipients input:
   - Text input + Add button, Enter key adds; validates with a simple email regex; dedupes; caps at 10 addresses.
   - Renders added addresses as removable chips.
4. In `handleSendDotConsultantEmail`, include `cc_emails: dotCcEmails` in the invoke body, and clear `dotCcEmails` on success (alongside notes/attachments reset).
5. Toast `description` becomes `Sent to ${data.sent_to.join(', ')}` (already correct — edge function will include CCs in `sent_to`).

**`supabase/functions/send-dot-consultant-request/index.ts`**

1. Parse optional `cc_emails: string[]` from the request body.
2. Validate: trim, lowercase, dedupe, drop `tracey@iondot.net` (avoid double-send), drop anything that fails a basic email regex, cap at 10.
3. Pass `cc: validatedCcs` (when non-empty) to the Resend `send` payload alongside the existing `to: [RECIPIENT_EMAIL]`.
4. Include the CCs in the `sent_to` array returned to the client so the success toast reflects them.
5. Log line: include CC count.

### Out of scope

- No database changes, no new table, no persistent "default CC list" — this is a per-send input.
- No changes to Stage 7 insurance flow.
- No template/HTML body changes.
