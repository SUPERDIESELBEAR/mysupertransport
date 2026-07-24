## Tighten the Notify Safety Advisor dialog copy and lock Marcus in as CC

Three small, scoped tweaks to `src/components/staff/NotifySafetyAdvisorDialog.tsx` only. No edge function changes needed — the owner is already auto-CC'd server-side; this change just makes it visible and non-removable in the UI.

### 1. Remove the "send a test" helper line under **To**
Delete the paragraph:
> "Pre-filled with Tracey L. McQuilken. Remove her and add your own address to send a test."

Tracey stays pre-filled and removable (functionality unchanged) — just no instructional text encouraging test sends.

### 2. Pre-fill Marcus Mueller as a locked CC chip
- On open, seed `ccEmails` with `marc@mysupertransport.com` (owner) in addition to the signed-in sender.
- Render Marcus's chip **without** the `×` remove button (styled like Tracey's gold chip for visual parity, labeled `Marcus Mueller <marc@mysupertransport.com>`).
- Guard the remove handler so Marcus can never be filtered out even if the DOM is manipulated.
- Update the CC helper line from "Pre-filled with you. The owner is automatically copied." to "Marcus Mueller (owner) and you are pre-filled. Add more if needed."

Owner email is hardcoded as a constant (`OWNER_EMAIL`, `OWNER_NAME`) at the top of the file, matching the existing `RECIPIENT_EMAIL`/`RECIPIENT_NAME` pattern. No DB lookup or new RPC needed.

### 3. Replace the dialog description
Current text under the "Notify Safety Advisor" title:
> "{operatorName} has been deactivated. Send the deactivation notice — Tracey L. McQuilken is pre-filled as the recipient but can be removed for test sends. This dialog cannot be dismissed."

Replace with a short purpose statement:
> "{operatorName} has been deactivated. Send the required notice to the Safety Advisor so DQ files and compliance records stay current."

### Files touched
- `src/components/staff/NotifySafetyAdvisorDialog.tsx` (only)
