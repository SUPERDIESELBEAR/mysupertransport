## Order of work

1. Read state and the pop-up — the part that changes staff behaviour.
2. "Take me there", categories, audience and pinning.
3. Read receipts in the composer.

## What a staff member sees

- Signs in, lands on the dashboard. If anything is unread, one panel opens with the newest announcement and a count of the rest. "Got it" moves to the next; closing the panel marks the shown ones as seen. Never more than once per announcement per person, except ones marked as requiring acknowledgment.
- Sidebar "What's New" carries a gold count until the list is clear.
- Every announcement can have a button that opens the screen it describes.
- Drivers see none of this — the operator portal is untouched.

## Technical notes

**Schema, staged as additive migrations in this draft** (they go live when the draft is accepted):

- `release_notes` gains `category` (enum: feature / change / fix / reminder), `target_roles` (text[] default all staff roles), `link_route` and `link_label` (nullable), `is_pinned`, `requires_ack` (both boolean default false). Existing rows keep working — untouched columns default to today's behaviour.
- New `release_note_reads` (id, release_note_id FK, user_id, seen_at, acknowledged_at, company_id with the standard stamp trigger). RLS: a staff member reads and writes only their own rows; owner and management read all. GRANT select/insert/update to `authenticated`, ALL to `service_role`, no `anon`.
- The existing `notify_staff_on_release_note` trigger is extended to respect `target_roles` instead of notifying every staff role unconditionally. Nothing about the driver side changes.

**Client:**

- `useUnreadReleaseNotes` hook — notes matching the viewer's roles with no `release_note_reads` row, plus any `requires_ack` note without `acknowledged_at`.
- `WhatsNewDialog` rendered once from the management shell (`ManagementPortal.tsx`) and the staff portal shell, suppressed while a route has unsaved changes (the existing `useUnsavedChanges` guard) and in demo mode.
- Sidebar badge in the same nav config that already defines the "What's New" entry.
- `ReleaseNotesManager.tsx` composer gains category, audience checkboxes, pin, require-acknowledgment, and a screen picker whose options come from `STAFF_HELP_INDEX` (it already holds every staff route and title). Past announcements gain a "Seen by N of M" row that expands to names.

**Untouched:** the email path (`send-release-note`, Staff & Admin routing and per-person preferences), the bell notification type `release_note`, the FAQ re-verification flagging, and the Staff Help ingest that already indexes announcements.
