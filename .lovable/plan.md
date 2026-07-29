## Goal
Overhaul SUPERDRIVE messaging on both driver and staff sides: contact-driven driver messaging with per-staff availability + per-driver allowlist, staff floating chat popup, oldest-unanswered-first sort, and group chats.

---

## 1. Staff availability model

Each staff member has a single **availability mode** (self-toggle in profile; owner can override any staff's mode):

- **`all_drivers`** — reachable by every driver.
- **`specific_drivers`** — reachable only by drivers on their explicit allowlist.
- **`none`** — not reachable by any driver (staff can still DM drivers first).

A driver can DM a staff member iff:
- Staff mode is `all_drivers`, OR
- Staff mode is `specific_drivers` AND the driver is on that staff's allowlist.

Staff can always initiate DMs to drivers regardless of availability.

## 2. Driver Contacts (new)

New "Contacts" tab in the driver Messages area. Lists staff the driver is allowed to reach, showing name, role, avatar, and an availability dot. Tap → opens/creates 1:1 thread. Empty state: "No staff assigned yet — reach out to your dispatcher."

## 3. Auto-populate contacts for new drivers

When a driver becomes active (Go-Live), auto-seed their reachable contacts with:
- Their assigned dispatcher (from `operators`/onboarding record).
- Their onboarding lead.
- Every staff currently on `all_drivers` mode (implicit — no allowlist row needed; resolved at query time).

Only `specific_drivers` allowlist rows are stored. `all_drivers` staff are always visible without per-driver rows.

## 4. Delete/hide chats — deferred

Not building for v1 per DOT/audit concerns. Threads remain visible on both sides. Revisit later as "Archive" if users request it.

## 5. Floating chat popup (staff)

Single global draggable window mounted once in `StaffLayout`:
- Draggable by header; minimize to a corner pill; three fixed sizes (S/M/L).
- Position + minimized state persisted in `localStorage`.
- Persists across route changes.
- Opened from bell, driver profile "Message" button, or Messages page "Pop out".
- Shows thread list + active thread; one thread active at a time.

## 6. Inbox sort: oldest unanswered first

Both apps, both the Messages page and the popup thread list:
- Threads with at least one unread inbound message → sorted **ascending** by `last_inbound_at` (oldest waiting on top).
- Threads with no unread → below, sorted by most-recent activity.

## 7. Group chats

New `is_group` flag on threads + `thread_participants` table.

Creation rules:
- **Staff creator**: any mix of other staff + drivers.
- **Driver creator**: multiple staff (only from their contacts), **no other drivers**.
- **Staff-only groups** supported (internal).

UX: "New group" button in Messages (gated per rules), group title editable by creator/staff, participant list visible, per-participant read state. Group threads follow the same sort rule as 1:1s.

## 8. Notifications

Every participant is notified on every group message (in-app + email per each user's existing prefs). Reuses the existing `notify-new-message` edge-function pipeline, extended to fan out to all participants of a thread.

---

## Technical outline

**New / changed tables (migration + GRANTs + RLS):**
- `staff_messaging_settings`: `staff_id`, `availability_mode` (`all_drivers|specific_drivers|none`), `availability_note`, `updated_at`.
- `driver_staff_contacts`: `driver_id`, `staff_id`, `created_by`, `created_at`; unique pair. Only used when staff mode = `specific_drivers`.
- `message_threads`: `id`, `is_group`, `title`, `created_by`, `created_at`, `last_message_at`, `last_inbound_at` (max of any inbound for read-state sort — computed per-viewer in RPC).
- `thread_participants`: `thread_id`, `user_id`, `role_in_thread`, `last_read_at`, `joined_at`.
- Extend `messages` to belong to a `thread_id` (already present in `MESSAGE_SELECT`); keep `sender_id`/`recipient_id` for 1:1 back-compat while migrating.

**Security-definer functions:**
- `can_driver_message_staff(_driver uuid, _staff uuid) returns boolean`
- `list_driver_contacts(_driver uuid)` — union of `all_drivers` staff + specific allowlist rows.
- `list_inbox(_user uuid)` — returns threads with per-viewer unread count + `oldest_unread_at`, sorted per §6.
- `create_thread(...)` — validates participant rules (drivers can't add other drivers, etc.).

**RLS:**
- `driver_staff_contacts`: driver `SELECT` own; staff (management/owner) CRUD.
- `staff_messaging_settings`: staff can update own row; owner/management can update any.
- `thread_participants` + `messages`: participants can read; message insert must be participant AND (for driver→staff DMs) `can_driver_message_staff` passes.

**Frontend:**
- Driver: `DriverContactsPanel.tsx`, updated `OperatorMessagesView.tsx` (new-thread flow gated by contacts, new sort, group create with driver rules).
- Staff: `FloatingChatWindow.tsx` + `useFloatingChatStore` (Zustand w/ localStorage), mounted in `StaffLayout`. Updates to `MessagesView.tsx` (sort, group create). `StaffAvailabilityCard.tsx` (mode toggle + note) in staff profile. `DriverContactsManager.tsx` on driver profile (management/owner) to manage per-staff allowlists. Owner-only "Staff availability admin" panel to override any staff's mode.
- Group creation modal shared, participant picker filtered by rules above.
- Go-Live hook (existing `notify_operator_on_status_change` trigger or new trigger) inserts dispatcher + onboarding lead into `driver_staff_contacts` for that driver.

**Notifications:** `notify-new-message` edge function updated: given `message_id`, look up `thread_participants`, fan out in-app rows + email per each participant's `notification_preferences`.

**Realtime:** existing channel on `messages`; add `thread_participants` for read-state updates in the popup.

## Non-goals (v1)
- Delete/hide/archive threads.
- Multiple simultaneous floating windows.
- Driver-initiated group chats that include another driver.
