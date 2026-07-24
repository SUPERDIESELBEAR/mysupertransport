## Plan

1. **Make the modal close immediately on successful send**
   - In `NotifySafetyAdvisorDialog`, add a local `sentAndClosing` guard that renders nothing after the email function returns success.
   - Set that guard before showing the success toast so the blocking modal disappears right away, even if the parent state update is delayed.

2. **Keep the parent state in sync**
   - Keep calling `onSent(...)` after success so `OperatorDetailPanel` still updates `safetyAdvisorNotifiedAt` when Tracey is included and still sets `showNotifyAdvisorDialog(false)`.
   - Preserve the current rule: if Tracey is not included, the popup closes but the red “Safety Advisor notification required” banner remains available for a later send.

3. **Prevent stale reopen behavior**
   - Reset the local close guard whenever the dialog opens for a new driver or a new send attempt.
   - Keep outside-click and Escape disabled so staff cannot dismiss the notice manually before sending.

4. **Verify the fix**
   - Run a targeted check that the gold **Send Deactivation Notice** button no longer leaves the modal overlay on screen after a successful send path.