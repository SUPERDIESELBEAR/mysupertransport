## Technical detail

**Evidence for the "unrecoverable" call.** `pei_requests` holds zero rows for application `c815e1bd-8c73-425a-8b6d-56f116221286`; `pei_request_events` has zero orphaned rows (nothing survived the cascade); `audit_log` records no PEI action beyond `pei_release_viewed` and `pei_cadence_settings_updated`; `email_send_log` has the pending/sent pair for `pei-request-initial` to `maddoxb@schneider.com` on 2026-08-05 21:38 UTC, message id `b84b5539…`. No soft-delete column and no history table exists for this family, so there is nothing to read the old row back from.

**Rebuild.** Three `pei_requests` inserts derived from `applications.employment_history`, `status` left at the pre-send state so `update_application_pei_status` recomputes `pei_status`/`pei_deadline` on send rather than now. `company_id` stamped from the application's carrier. Sending uses the existing initial-request path unchanged — no new email template, no new function.

**Attribution.** New `audit_log` actions for request created / sent / follow-up / withdrawn, written by the same definer paths that already mutate `pei_requests`, using `current_profile_id()` for the actor, with employer name and application id in the row. `sent_by_staff_id` is already on the table but unenforced; the send path will populate it.

**Soft delete.** Staged additive columns on `pei_requests`: `withdrawn_at`, `withdrawn_by`, `withdrawn_reason`. Delete from the UI becomes a withdraw update; list queries and the PEI status trigger exclude withdrawn rows. A hard `DELETE` is refused by a guard trigger so the same loss cannot recur.

**Status-mismatch flag.** A view/read path surfacing applications whose `pei_status` is `in_progress` (or `complete`) with no live `pei_requests` row, shown on the staff PEI screen. Marquis Bowie and William Westbrook are the two known cases.

**Draft note.** This is a draft, so the column and trigger changes are staged as an additive migration and take effect when you accept the draft; the record rebuild for his three employers is data and can be done now. The three new requests are real rows in the live system — I'll confirm with you before writing them, and nothing is emailed until you press send.

## Proof

- His application page shows three requests awaiting send, with correct employers and dates.
- Sending one from the UI writes a log line naming the staff member and the employer.
- Withdrawing one keeps it readable in history and removes it from the working list.
- The mismatch list is empty for him once the requests exist.
- Full test suite with `--maxWorkers=2`, typecheck, and a dated pass report under `docs/passes/`.
