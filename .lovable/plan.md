## Goal

Send the **SUPERDRIVE install invite** ("full feature tour" email) to operators in the Applicant Pipeline:
1. **Auto** — once when an operator account is first created (via `invite-operator`).
2. **Manually** — from a per-row action on the Pipeline, available for any pipeline operator that already has a user account.

Both flows reuse the existing `launch-superdrive-invite` edge function (the same one powering the Launch SUPERDRIVE dialog) so we don't fork email logic, audit, or send rules.

---

## Behavior

**Template:** Always `'full'` (the "Full feature tour" welcome email — features + install instructions + password-recovery CTA).

**Cooldown:** **24 hours**, enforced server-side via the existing `audit_log` action `superdrive_invite_sent`. Below the existing 30-day Launch dialog cooldown, so we'll add an optional `cooldown_hours` request param (defaults to current `30 * 24`).

**Auto-trigger:** Fires once, immediately after a new operator row is inserted in `invite-operator`. Best-effort (fire-and-forget — does not block the invite response if the email send fails). The 24h cooldown protects against duplicate sends if invite-operator is replayed.

**Manual action:** New chip/button on each Pipeline row (next to existing "Invite Pending" / "Resend Invite" chips), shown for any operator with `op.user_id`. Disabled while sending; tooltip shows last sent timestamp; toast confirms result. If 24h cooldown blocks the send, the toast surfaces "Sent <X> ago — try again later".

**Audit:** Reuses existing `audit_log` `superdrive_invite_sent` rows (with `metadata.source = 'pipeline_auto'` or `'pipeline_manual'` so we can distinguish them later from Launch dialog sends).

---

## Files to change

**`supabase/functions/launch-superdrive-invite/index.ts`**
- Accept new optional body field `cooldown_hours` (number). Default = `30 * 24`. Validate 1–8760.
- Compute `cooldownCutoff` from `cooldown_hours` instead of the hardcoded `COOLDOWN_DAYS`.
- Accept new optional `source` field (string, e.g. `'pipeline_auto'` | `'pipeline_manual'` | `'launch_dialog'`); pass through into `audit_log.metadata.source`.
- No other behavior changes — Launch dialog stays on the 30-day default.

**`supabase/functions/invite-operator/index.ts`**
- After the new `operators` row is inserted (around line 178, only when a brand-new operator is created — not when `existingOp` was found), fire `supabaseAdmin.functions.invoke('launch-superdrive-invite', { body: { operator_ids: [operatorId], template: 'full', cooldown_hours: 24, source: 'pipeline_auto' }, headers: { Authorization: <caller token> } })`.
- Wrap in try/catch with `console.error` only — never block or fail the invite response on email errors.
- Skip when `skip_invite === true` (pre-existing operators get the Launch dialog flow instead).

**`src/pages/staff/PipelineDashboard.tsx`**
- Add row-state map `installInviteSending: Record<string, boolean>` and `installInviteSent: Record<string, boolean>` mirroring the existing `resendingSending` / `resendSent` pattern.
- Add `handleSendInstallInvite(op)` that calls `supabase.functions.invoke('launch-superdrive-invite', { body: { operator_ids: [op.id], template: 'full', cooldown_hours: 24, source: 'pipeline_manual' } })` with the session token, parses the per-operator result, and toasts success / cooldown / error.
- Render a new chip-style button next to the existing "Invite Pending / Resend Invite" cluster (in the same `<td>` block around line 3177–3221), visible whenever `op.user_id` exists. Label: **"Send App Install"**, icon `Smartphone` from lucide-react. Spinner while sending, "Sent" + check on success.
- Guard with `useDemoMode().guardDemo()` to match other staff actions.

---

## Out of scope

- No new edge function — both flows reuse `launch-superdrive-invite`.
- No changes to the existing Launch SUPERDRIVE dialog (still 30-day cooldown, still operates on fully-onboarded active operators).
- No changes to the daily PWA install-reminder cron — that continues to target installed-but-not-launched drivers separately.
- No new template variant — uses the existing `'full'` welcome email.
