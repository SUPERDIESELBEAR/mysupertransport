## Make Tracey a removable "To" recipient

Right now `tracey@iondot.net` is hardcoded as the sole recipient in both the dialog and the edge function. To support test sends, treat Tracey the same way we treat CCs — pre-filled but editable.

### Dialog (`NotifySafetyAdvisorDialog.tsx`)
- Add a new **To** field above the CC field, styled with the same chip UX as CCs.
- Pre-populate it with `tracey@iondot.net` on open (alongside Marcus in CCs, from the previous plan).
- Allow removing Tracey and adding other recipients (e.g., the sender's own email for testing).
- Require at least one valid recipient in `To` for the Send button to enable.
- Update the confirmation copy — instead of "Email sent to Tracey L. McQuilken…", show the actual recipient count/list.

### Edge function (`send-deactivation-notice`)
- Accept a new `to_emails: string[]` field in the request body.
- Validate: at least one entry, each a valid email, cap at 15.
- Use `to_emails` as the Resend `to` array instead of the hardcoded `RECIPIENT_EMAIL`.
- Owner-auto-CC logic stays but skips any email already present in `to_emails`.
- Subject/body wording that currently reads "Safety Advisor" stays the same — it still describes the notification's purpose regardless of who the test recipient is.

### Banner + audit
- Same banner logic ("Safety Advisor notification required") until any send succeeds. For test sends where Tracey was removed, staff can re-open the dialog later to send the real notification; the banner clears once any send completes. If you'd prefer the banner only clears when Tracey specifically is included, tell me and I'll gate `safety_advisor_notified_at` on that.

### Files touched
- `src/components/staff/NotifySafetyAdvisorDialog.tsx`
- `supabase/functions/send-deactivation-notice/index.ts`
