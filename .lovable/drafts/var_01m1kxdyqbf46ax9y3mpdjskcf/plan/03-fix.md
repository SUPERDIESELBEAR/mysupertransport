## The fix

Make the confirmation tell the truth about where the message went.

1. **Green confirmation line** — replace the fixed consultant name with the actual recipients returned by the send. One address reads "Notice sent to marc@mysupertransport.com"; several read "Notice sent to marc@… and 2 others", with the full list visible underneath.
2. **Toast** — same change, so the pop-up and the line on the page always agree.
3. **Flag the test case** — when the saved DOT Consultant was removed from the To field, the confirmation adds a quiet note: "DOT Consultant was not included — the driver's notification is still outstanding." That already matches what the system records internally; it is simply never shown.

Nothing about who receives the email changes. Removing Tracey already worked, and it will keep working.

## Technical notes

`src/components/management/DeactivationWizardContent.tsx` — the `safetySent` block and the success toast both interpolate `consultantLabel`, derived from `dot_consultant_email_settings.consultant_name`. The edge function `send-deactivation-notice` already returns `sent_to` (To + CC) and `consultant_included`; store that response in state on success and render from it. No edge-function, schema, or delivery-path change.
