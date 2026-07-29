## Phase 3 — Group Chats

Add multi-participant chats on top of the existing `message_threads` foundation. Preserve 1:1 threads and read receipts.

### Rules (from your answers)
- **Staff can create groups with:** other staff + multiple drivers (mixed).
- **Drivers can create groups with:** multiple staff (from their contacts). Drivers cannot add other drivers.
- **Only the creator (or any staff admin)** renames the group or adds/removes members.
- **Drivers see:** group name, staff participants by name, other drivers hidden as "and N others".
- **Leaving:** staff can leave anytime (system message posts). Drivers cannot self-leave — creator/admin removes them.

### Data model
- Reuse `message_threads` (`id`, `is_group`, `title`, `created_by`) and `thread_participants` (`role_in_thread`: `admin` | `member`).
- Extend `messages` with `thread_id` as the primary link (existing column). Keep `recipient_id` populated as sender's counterpart for 1:1 back-compat; for groups `recipient_id = created_by` (satisfies NOT NULL) but reads go by `thread_id`.
- New RLS: participants can `SELECT` messages where `thread_id` is in their participant set; `INSERT` requires participant membership; staff admins/creator can `UPDATE` thread title & participants.
- Add `has_thread_access(thread_id, uid)` SECURITY DEFINER helper to avoid recursive RLS.
- Add system-message support (`sender_id = created_by`, `body = 'Emma added Robert', is_system = true`) via new `is_system boolean` column on `messages`.

### Edge function
- `create-group-thread`: validates caller role, enforces "drivers cannot add drivers", creates thread + participants + initial system message.
- `manage-group-participants`: add/remove/rename with admin check; posts system message; fan-out notifications to all participants (reuse `notify-new-message`).

### Front-end
- **`useMessageThread` refactor:** switch from `(myUserId, otherUserId)` to `(myUserId, threadId)`. Load messages by `thread_id`. Realtime filter on `thread_id=eq.<id>`. Send inserts `thread_id`; for groups omits per-recipient assumptions.
- **`MessageThread` wrapper:** accept either `otherUserId` (1:1 legacy, resolves thread) or `threadId` (group).
- **Staff `MessagesView`:** add a "New group" button in the sidebar → `NewGroupModal` (multi-select staff + drivers). Show group threads with a group icon + participant count. Sort/unread logic unchanged.
- **Driver `OperatorMessagesHub`:** add "New group with staff" in Contacts tab → modal to multi-select available staff. Group thread rows show `title` + "You, Emma, Kevin, and 2 others".
- **Group header:** shows title, participant chips. Admin sees "Manage" button → `ManageGroupModal` (rename, add/remove, leave for staff). Drivers see the collapsed roster only.
- **System messages:** centered gray pill in transcript (`is_system`).
- **Notifications:** `notify-new-message` already reads participants — extend to fan out one in-app notification per participant (excluding sender) for group threads.

### Files touched
- Migration: `messages.is_system`, `messages` RLS by `thread_id`, `has_thread_access`, `message_threads.title` (already exists), grants.
- New: `supabase/functions/create-group-thread/index.ts`, `manage-group-participants/index.ts`.
- New: `src/components/messaging/NewGroupModal.tsx`, `ManageGroupModal.tsx`, `GroupHeader.tsx`.
- Edit: `useMessageThread.ts` (thread_id mode), `MessageThread.tsx`, `MessageBubble.tsx` (system pill + per-message sender label for groups), `MessagesView.tsx` (staff sidebar + group rows), `OperatorMessagesHub.tsx` + `DriverContactsPanel.tsx` (driver "New group" entry point), `FloatingChatWindow.tsx` (group rows).
- Edit: `notify-new-message` edge function (fan-out).

### Out of scope for this turn
- Group reactions/pins already work via existing message-level RLS.
- Typing indicators in groups (defer — noisy with many participants).
- Group avatars (initials from title for now).

I'll ship this in one pass and run the typecheck before handing back.
