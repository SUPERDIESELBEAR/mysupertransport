# Welcome Email Preview + Messaging Upgrades

## Phase 1 — Email Catalog Entry (quick, ~1 file)

Add the **SUPERDRIVE Launch Invite** to the Email Catalog so management can preview the exact email operators receive.

**File:** `src/components/management/EmailCatalog.tsx`

- New entry under the **Invitations** category, id `welcome_superdrive`.
- Subject: `Welcome to SUPERDRIVE — Your Operator App Is Ready`
- `renderHtml()` mirrors the edge function's `buildWelcomeEmailHtml()` exactly: greeting, intro, gold CTA button, six feature cards (Inspection Binder, Settlement Forecast, My Truck, Dispatch Status, Direct Messages, Payroll Calendar), dark "Install on your phone" callout with iOS/Android steps, and signoff. Uses the existing local `buildEmail()` helper for header/footer/branding consistency. Sample recovery URL `#preview` is used in the CTA.

---

## Phase 2 — Messaging Upgrades

Note: **Read receipts ("Seen" indicator) are already live** in both staff and operator messaging views — no work needed there. Below are the new upgrades you selected.

### Schema changes (one migration)

Add columns to `public.messages`:
- `edited_at timestamptz` — set when sender edits; UI shows "(edited)"
- `deleted_at timestamptz` — soft-delete; UI replaces body with "Message deleted"
- `reply_to_id uuid REFERENCES messages(id)` — for quoted replies
- `attachment_url text`, `attachment_type text`, `attachment_name text` — single attachment per message
- `pinned_at timestamptz`, `pinned_by uuid` — only staff/management can pin

New table `public.message_reactions`:
- `id, message_id (FK), user_id, emoji text, created_at`
- Unique on `(message_id, user_id, emoji)` so each user can only apply each emoji once
- Realtime enabled
- RLS: any thread participant can SELECT; users can INSERT/DELETE their own reactions

New storage bucket `message-attachments` (private):
- RLS: only sender + recipient of the parent message can read; sender can upload
- 20 MB limit; allow images and PDFs

Update `messages` RLS:
- UPDATE policy expanded so sender can edit/delete their own message (within 5 min for edits, anytime for soft-delete)
- Staff/management can pin/unpin any message in threads they participate in

### Realtime channel for typing indicators

Use a Supabase Realtime **presence/broadcast channel** keyed by `thread_id`. No DB write — purely ephemeral. Each client broadcasts `typing: true` while the user types (debounced) and `typing: false` after 3s idle.

### UI work

**`OperatorMessagesView.tsx` and `MessagesView.tsx`** (mirror changes to both):

1. **Typing indicator** — subscribe to the thread's broadcast channel; show "Jane is typing…" with animated dots beneath the message list.
2. **Reactions** — long-press (mobile) / hover-and-click (desktop) opens a small emoji picker (👍 ❤️ ✅ 😂 🔥 🙏). Reactions render as chips below each message with counts. Tap an existing chip to toggle your own.
3. **Reply / quote** — swipe-right on mobile or hover "Reply" button on desktop sets `replyTo` state; composer shows the quoted message with an "x" to cancel. Sent reply renders the quoted snippet above the body and tapping it scrolls to the original.
4. **Attachments** — paperclip button in composer opens file picker. Image previews render inline; PDFs render as a card with filename and "Open" button using the existing in-app `FilePreviewModal` / `PDFModal` pattern (per `mem://features/in-app-document-viewer`).
5. **Edit / delete own messages** — three-dot menu on own messages: "Edit" (within 5 min, opens inline editor), "Delete" (soft-delete with confirm). Edited messages show "(edited)" next to the timestamp; deleted messages show "Message deleted" in muted text.
6. **Pin messages** — staff-only three-dot option "Pin to top". Pinned message renders as a sticky banner at the top of the thread with "Unpin" button. Only one pinned message per thread (newest pin replaces previous).

### Push / email notifications for new DMs

New edge function `notify-new-message`:
- Triggered by a database trigger on `messages` INSERT
- Resolves recipient's notification preferences (existing `notification_preferences` table, new event_type `'direct_message'`)
- If recipient is online (presence channel active in last 60s) → skip email, in-app only
- If offline → insert in-app notification AND send a branded "New message from [sender]" email via the existing `_shared/email-layout.ts` `buildEmail()` helper, with a deep link to `/operator?tab=messages` or `/staff?messages=[user_id]`
- Throttled: at most one email per sender→recipient pair per 15 minutes (avoid spam during active threads)

Add `direct_message` toggle to:
- `OperatorNotificationPreferencesModal.tsx`
- `StaffNotificationPreferencesModal.tsx`

Add a matching preview entry in the Email Catalog under **Notifications** category.

---

## Suggested rollout order

1. Phase 1 (Email Catalog entry) — ship immediately, low risk.
2. Phase 2a (schema migration + storage bucket + RLS).
3. Phase 2b (typing indicators + reactions + reply/quote + edit/delete + pin) — UI-only, both views in parallel.
4. Phase 2c (attachments) — slightly more involved due to upload + preview wiring.
5. Phase 2d (DM notifications: trigger + edge function + preferences toggle + catalog preview).

Each phase is independently shippable. Ready to start with Phase 1 and Phase 2a together if you approve.