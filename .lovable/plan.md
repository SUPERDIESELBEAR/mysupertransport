## Fix the "Test send only" popup and rename the send button

### Problem
After sending a deactivation notice without Tracey in the **To** list, a secondary toast pops up saying *"Tracey was not included, so the notification-required banner will stay until the real send."* The user wants the send to complete cleanly without that extra popup, regardless of whether Tracey is a recipient.

### Changes

**`src/components/staff/NotifySafetyAdvisorDialog.tsx`**
- Remove the secondary `toast({ title: 'Test send only', ... })` block in `handleSend`. Only the primary "Deactivation email sent" toast will show.
- Keep the existing banner-clear logic unchanged: `onSent(data.notified_at)` still fires only when `data.tracey_included === true`, so the red "Safety Advisor notification required" banner on the driver profile still persists until Tracey actually receives the notice. This preserves the compliance guardrail silently.
- Rename the gold send button from `Send Email to <recipient>` to **Send Deactivation Notice**. The recipient list is already visible in the chips directly above the button, so repeating the address in the label is redundant; naming the action keeps the label correct for any recipient (Tracey, the owner, or a test address).

### Out of scope
- No change to the edge function, banner logic, or CC rules.
- No change to who receives the email or when the banner clears.
