## Goal

When a driver is deactivated, staff **must** email Tracey McQuilken (Safety Advisor) with the driver's details before the deactivation flow closes. Tracey replies directly by email to the sender and CCs — no inbound parsing into SUPERDRIVE.

## Flow

1. Staff opens the existing deactivate dialog, picks reason + notes, clicks **Yes, deactivate**.
2. Deactivation runs immediately (unchanged from today).
3. On success, the **"Notify Safety Advisor"** dialog opens automatically and is **mandatory** — no Skip, no outside-click dismiss, no Esc close, no top-right X. The only way to close it is to successfully send the email.
4. On successful send, a toast confirms delivery and a "Safety advisor notified <timestamp>" chip appears on the driver's profile.

## Notify Safety Advisor dialog (mandatory)

Modeled on the Stage 8 "Email Tracey McQuilken" panel. Dialog is non-dismissible (`onPointerDownOutside` / `onEscapeKeyDown` prevented, close button hidden).

Fields:
- **To** — `tracey@iondot.net` (locked, shown as read-only chip).
- **CC** — pre-filled with sender's email + Marcus Mueller (owner). Staff can add/remove additional recipients (chip input, same UX as Stage 8).
- **Driver name** — auto-filled, read-only.
- **Unit #** — auto-filled, read-only.
- **Termination date** — date picker, required, defaults to today (staff can change).
- **Reason for deactivation** — pre-filled from the deactivation reason just selected; editable dropdown with the same options (Resigned, Terminated, Personal Reasons, Truck Down, Not Compliant, Medical, Abandoned, Other).
- **Available for rehire?** — required radio group Yes / No, no default (must be explicitly chosen; Send disabled until picked).
- **Notes** — textarea, pre-filled with the deactivation notes captured a moment ago; editable.

**Send Email** button is the only action. Disabled until rehire is chosen and termination date is set. If the send fails (network/edge error), the dialog stays open, shows the error inline, and the button re-enables so staff can retry. There is no way to abandon the dialog.

### Resuming an unfinished notification

If a staff member force-closes the tab or loses connection after step 2 but before the email sends, we don't want a driver to be stuck deactivated with Tracey never notified. On page load, if any operator has `account_status = 'inactive'` AND `safety_advisor_notified_at IS NULL` AND was deactivated by the current staff user, re-open the mandatory dialog for that driver so they can complete it. A persistent red banner on the driver's profile — visible to all staff — reads *"Safety Advisor notification required — send email"* with a button to open the dialog, so any staff member can complete it if the original sender is unavailable.

## Email content

- **From:** SUPERDRIVE sender domain (existing config used by `send-dot-consultant-request`).
- **Reply-To:** sender's email, with CCs also included so Tracey's normal "Reply All" lands with the sender and all CCs — no need for SUPERDRIVE to intercept.
- **Subject:** `Driver Deactivation — {Driver Name} (Unit {###}) — {Termination Date}`
- **Body (HTML + plaintext):** Driver name, unit, termination date, reason, rehire eligibility (Yes/No), notes, sender name/role, and a short line: *"Please reply to this email with your acknowledgment or any follow-up. This inbox is monitored by the sender and copied staff."*

## Inbound replies

Deferred by request. Tracey replies with normal Reply/Reply-All in her email client; because Reply-To includes the sender + CCs, everyone on the thread receives her response in their own email. Nothing is posted back into SUPERDRIVE for now.

Suggestion for later (not built now): a lightweight **"Mark Safety Advisor acknowledged"** button on the driver record so staff can log when Tracey replied, capturing date + optional pasted response. This gives an in-app record without needing inbound email plumbing.

## Audit + records

- Append an `audit_log` entry (`driver_deactivation_email_sent`) with driver id, recipients (to + cc), termination date, reason, rehire, notes, and sender.
- Store last-sent timestamp on the operator record (new nullable column `safety_advisor_notified_at`) to drive the profile chip and the resume-banner logic.

## Technical notes

- New edge function `send-deactivation-notice` (mirrors `send-dot-consultant-request` structure: Resend via connector gateway, Zod-validated body, CORS headers, `Reply-To` set to `[sender, ...cc]`). Writes `safety_advisor_notified_at` and the audit_log entry on success.
- New component `src/components/staff/NotifySafetyAdvisorDialog.tsx` reusing chip-input from Stage 8's Tracey panel. Dialog is mandatory (no dismiss paths).
- Edit `src/pages/staff/OperatorDetailPanel.tsx`: after successful deactivation, open the new dialog; pass in reason/notes/driver context. Add the "notified" chip and the red "notification required" banner (with click-to-open dialog) for any inactive operator missing `safety_advisor_notified_at`. On mount, auto-open the dialog for any such driver being viewed.
- Migration: add `operators.safety_advisor_notified_at timestamptz`.
- No changes to the existing Stage 8 Tracey flow.
