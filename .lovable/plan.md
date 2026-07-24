## Problem
After the deactivation notice sends successfully, the mandatory Safety Advisor dialog stays open. `NotifySafetyAdvisorDialog` only calls `onSent` when Tracey is in the recipient list, and the parent only closes the dialog inside that `onSent` callback — so any send that omits Tracey (test send or intentional custom recipients) leaves the modal stuck on screen.

## Fix
Always close the dialog after a successful send; only stamp `safety_advisor_notified_at` when Tracey received it.

1. **`src/components/staff/NotifySafetyAdvisorDialog.tsx`**
   - Change the `onSent` prop signature to `(notifiedAt: string | null) => void` and always invoke it on a successful send. Pass `data.notified_at` when `data.tracey_included` is true, otherwise `null`.

2. **`src/pages/staff/OperatorDetailPanel.tsx`** (both `NotifySafetyAdvisorDialog` call sites, ~line 4129 and ~line 7136)
   - Update the `onSent` handler to:
     - Always call `setShowNotifyAdvisorDialog(false)` and set `autoNotifyPromptedRef.current = true`.
     - Only call `setSafetyAdvisorNotifiedAt(sentAt)` when `sentAt` is non-null (so the red "notification required" banner still shows on test sends without Tracey).

No changes to the edge function, toast copy, or button label.