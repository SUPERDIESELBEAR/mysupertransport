# Technical details

Confirmed live: `release_notes` carries `status`, `category`, `target_roles`, `link_route`, `requires_ack`, `auto_drafted`, review/publish stamps; `notify_staff_on_release_note` fires only on the transition into `approved`; the bell taxonomy registers exactly one key, `release_note` (tier `watch`, category `system`). No path writes a notification for a `pending` row.

## Changes

1. **New notification type** `release_note_pending` in `src/lib/notifications/taxonomy.ts` — tier `action`, category `system`, label "Update Awaiting Approval". Registered before anything writes it, per the existing rule about unregistered types rendering as a bare "Notification".

2. **New trigger** `notify_owner_on_pending_release_note`:
   - AFTER INSERT on `release_notes` `WHEN (NEW.status = 'pending')`, plus AFTER UPDATE OF `status` on the transition *into* `pending` (a re-submitted draft).
   - Inserts one `notifications` row per user holding `owner`, type `release_note_pending`, `channel 'in_app'`, `link '/management?view=whats-new'`, title `"New update ready to review — " || NEW.title`, body the first ~300 characters of `NEW.body`.
   - Honours `notification_preferences` for `release_note_pending` the same way the existing function honours `release_note`.
   - SECURITY DEFINER, `search_path` pinned, EXECUTE revoked from PUBLIC/`anon`/`authenticated`; undo statements in a header comment. Staged as an additive migration under this draft's `migrations/` folder — it applies when the draft is accepted, not now.
   - No `net.http_post` in this trigger: pending drafts stay in-app only.

3. **Pending count on the menu** — `useUnreadReleaseNotes` (or a small sibling hook) also returns a `pendingCount` for owner/management viewers (`status = 'pending'`), rendered as the gold count on the Settings → What's New sub-nav entry alongside the existing unread count. Existing SELECT policy already exposes pending rows to management and the owner only.

4. **Email (optional, off by default)** — reuse `send-release-note`? No: it mails the whole staff list. If email for pending drafts is wanted, it is a separate small function scoped to the owner's address via `resolveEmailRecipients`. Recommendation: ship the bell + count first, add email only if the bell proves too quiet.

## Untouched

Approval gate (`enforce_release_note_review`), audience targeting, `notify_staff_on_release_note`, `WhatsNewDialog`, read receipts, driver visibility (none), permissions.

## Verification

- Extend `src/test/release-note-approval.test.ts`: the pending trigger exists and fires only on `pending`; it targets the `owner` role only; `release_note_pending` is registered in the taxonomy; no email post in the pending path.
- After acceptance: insert a test pending row as management, confirm exactly one notification for the owner and none for dispatcher/onboarding, then delete the test row.
- Typecheck and the full suite with `--maxWorkers=4`.
