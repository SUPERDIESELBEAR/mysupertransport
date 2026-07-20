## How assignment works today

- `notifications` already has an `assigned_to` column from the earlier Notifications Restructure.
- `src/lib/notifications/actions.ts` exposes `assign()` / `assignMany()` that just set `assigned_to`.
- `NotificationBell.tsx` and `NotificationHistory.tsx` filter an **"Assigned to me"** queue by `assigned_to === auth.uid()`.
- **Gap:** no UI picks the assignee, no note is attached, and the assignee gets no push. Only owner Marcus can currently see cross-staff activity via raw DB access.

## What to build

A first-class **Assign / Re-assign / Decline** flow with an optional note, a targeted popup to the assignee only, an ack back to the assigner, and an owner audit feed for Marcus Mueller.

### 1. Assign action UI

Add an **Assign** control (`UserPlus` icon) to:
- Each row in `NotificationHistory.tsx` and its bulk action bar
- The row menu in `NotificationBell.tsx`

Opens `AssignNotificationModal`:
- **Assignee** — searchable combobox of active staff (`onboarding_staff | dispatcher | management | owner`) from `profiles` ⨝ `user_roles`, self excluded, with "Assign to me" shortcut.
- **Note (optional)** — textarea, ~500 chars, "Why are you sending this to them?"
- **Send popup to assignee** — checkbox, default **on**.
- Buttons: Cancel · Assign.

### 2. Assignee-side actions (Re-assign & Decline)

On any notification where `assigned_to = auth.uid()`, and in the assignment popup card, show:
- **Accept** (default — just dismiss popup, keep it in inbox)
- **Re-assign** → reopens `AssignNotificationModal` prefilled; server records this as a re-assignment (see audit below).
- **Decline** → opens a small prompt for an optional reason, clears `assigned_to` back to `null` (returns it to the shared queue), and notifies the original assigner.

### 3. Server-side write — `assign-notification` edge function

Auth: `getClaims` + staff-role check (matches `send-staff-birthday-message` pattern).

Input:
```
{ action: 'assign' | 'reassign' | 'decline',
  notificationIds: string[],
  assigneeUserId?: string,      // required for assign/reassign
  note?: string,                // optional message
  sendPopup?: boolean }         // default true
```

Behavior:
1. Update source rows: `assigned_to = <assignee>` (or `null` on decline).
2. Insert an **assignee notification** (only on assign/reassign; sends the popup):
   - `user_id = assigneeUserId`, `type = 'assignment'`, `priority = 'action'`
   - `title = "<AssignerName> assigned you a notification"` (plural if >1)
   - `body = note || <first source title>`
   - `link = <first source link>`, `entity_type = 'notification'`, `entity_id = <first source id>`
3. Insert an **assigner ack notification** back to whoever last assigned the item:
   - On **accept/read** by the assignee → `"<Assignee> received your assignment"`
   - On **decline** → `"<Assignee> declined your assignment"` + reason
   - On **re-assign** → `"<Assignee> re-assigned your item to <NewAssignee>"`
4. Insert an **owner audit notification** to Marcus Mueller (lookup by owner role, single user) mirroring every assign / reassign / decline event: `"<Actor> <action> notification → <Target>"` with the note/reason in the body and a link to the source. Type `assignment_audit`, priority `fyi`, so it sits quietly in Marcus's inbox / audit feed and does not popup.

Ack-on-read: extend `markRead` (or a small trigger on `notifications` when `type='assignment'` transitions to read) to fire the assigner ack once. Simpler path: do it client-side in `AssignmentPopup` when the assignee taps **Accept/Open**, by calling the same edge function with `action: 'ack'`.

### 4. Popup — assignee only

New `AssignmentPopup.tsx` mounted in `StaffLayout.tsx` (covers Management, Dispatch, Staff, Owner portals in one place — no owner-wide broadcast because the popup is driven off `user_id = auth.uid()` rows only).

Visuals: mirror `BirthdayAnniversaryPopup.tsx` — fixed top-right stack, gold border, avatar circle, dismiss X, minimizable pill. Card contents:
- Assigner avatar + name
- "Assigned you: <source title>"
- Note (if present)
- Buttons: **Open** (nav to `link`) · **Re-assign** · **Decline**
- X to dismiss without acting (stays in inbox)

Hook `useAssignmentPopupEvents.ts`:
- Fetches unread `notifications` where `user_id = auth.uid()`, `type = 'assignment'`, `read_at is null`, `archived_at is null`.
- Realtime channel on `notifications` insert filtered by `user_id=eq.<me>` so a fresh assignment appears without refresh.

### 5. Where things land

| Recipient | Where | Type | Popup? |
| --- | --- | --- | --- |
| Assignee | Inbox → Action tier → "Assigned to me" | `assignment` | Yes (top-right) |
| Assigner | Inbox → FYI tier | `assignment_ack` | No |
| Owner (Marcus) | Inbox → new "Assignment Audit" category | `assignment_audit` | No |

Source notification row in `NotificationHistory.tsx` gains an "Assigned to <Name>" chip so anyone viewing it sees current ownership.

### 6. Taxonomy + realtime

- `src/lib/notifications/taxonomy.ts`: register `assignment`, `assignment_ack`, `assignment_audit` (category `Team`; tiers per table above).
- `NotificationBell.tsx` already subscribes to inserts — the three new types flow through with no changes; the bell just shows them in the correct tier.

## Files to add / touch

- Add: `src/components/management/AssignNotificationModal.tsx`
- Add: `src/components/staff/AssignmentPopup.tsx`
- Add: `src/hooks/useAssignmentPopupEvents.ts`
- Add: `supabase/functions/assign-notification/index.ts`
- Edit: `src/lib/notifications/taxonomy.ts`
- Edit: `src/components/management/NotificationHistory.tsx` (row + bulk assign entry, "Assigned to <name>" chip, Reassign/Decline on my assignments)
- Edit: `src/components/NotificationBell.tsx` (row assign entry, Reassign/Decline on my assignments)
- Edit: `src/components/layouts/StaffLayout.tsx` (mount `AssignmentPopup` once for all staff portals)

Ready to implement when you approve.