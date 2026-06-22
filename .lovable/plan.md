# Broadcast Read/Acknowledgment Tracking — Final Plan

Nest the new Announcements inbox under a unified **Messages** top-bar item (with tabs: Announcements | Direct). Ship in two phases.

## Phase 1 — Tracking foundation (backend + composer toggle + email)

**Schema** (`supabase/migrations/...`):
- `operator_broadcasts.requires_acknowledgment boolean not null default false`
- `operator_broadcast_recipients`: add `opened_at timestamptz`, `read_at timestamptz`, `acknowledged_at timestamptz`, `track_token text` (random, per-row)
- Index `(broadcast_id)` on the new ack column for management queries
- RLS update: operators can `SELECT` and `UPDATE` (only `read_at`, `acknowledged_at`) their own recipient row via `operator_id → operators.user_id = auth.uid()`

**Composer (`OperatorBroadcast.tsx`)**:
- Add a Switch: "Require acknowledgment from recipients" (off by default), with helper text explaining the two modes
- Pass `requiresAcknowledgment` to `send-operator-broadcast`

**Edge functions**:
- `send-operator-broadcast`: persist `requires_acknowledgment`; inject per-recipient open pixel `<img src=".../broadcast-track-open?b=...&r=...&t=...">` and a "View in SUPERDRIVE" link into the email HTML
- New `broadcast-track-open` (public, `verify_jwt = false`): validates token, stamps `opened_at` if null, returns a 1×1 transparent GIF
- New `broadcast-acknowledge` (auth required): stamps `read_at` and (if required) `acknowledged_at` for the caller's recipient row

**Management visibility (`OperatorBroadcast.tsx` history view)**:
- New columns in the recipient drawer: Opened / Read / Acknowledged with timestamps
- Summary chips on each broadcast row: e.g. "12/20 read · 8/20 acknowledged"
- "Nudge" button: re-sends to unacknowledged-only recipients

The "View in SUPERDRIVE" link in emails routes to `/messages?b=<id>`. Until Phase 2 lands, it opens the existing Messages page — harmless, just doesn't deep-link.

## Phase 2 — In-app inbox under Messages

**Nav restructure** (`src/pages/operator/OperatorPortal.tsx`):
- Replace the current standalone direct-message nav item with a single **Messages** item (icon: `MessagesSquare`)
- Single unread badge = unread direct messages + unread broadcasts; gold dot overlay when any broadcast requires acknowledgment

**New route `/messages`**:
- Tabs (shadcn `Tabs`): **Announcements** | **Direct**
- Default tab = Announcements if any unread/unacknowledged broadcast exists, else Direct
- Per-tab unread counts in the tab labels

**Announcements tab**:
- List view: newest first, sender ("SUPERTRANSPORT Management"), subject, sent timestamp, unread dot, gold "Action required" chip when applicable
- Detail view: subject, body (sanitized), optional CTA button, sent timestamp; opening stamps `read_at` via `broadcast-acknowledge` (read-only mode)
- If `requires_acknowledgment`: gold "Acknowledge" button at the bottom; on click stamps `acknowledged_at`, button becomes a green "Acknowledged on {date}" badge
- Realtime subscription on `operator_broadcast_recipients` for live unread updates

**Direct tab**:
- The existing direct-message thread component, unchanged

**Deep link**: `/messages?b=<broadcastId>` opens Announcements tab + that broadcast's detail view (from the email "View in SUPERDRIVE" link).

## Out of scope
- Bounce/spam tracking
- SMS or push notifications
- Editing the acknowledgment toggle after a broadcast is sent
- Bulk export of acknowledgment status (can follow later)

## Technical notes
- Open pixel is best-effort only (Apple Mail Privacy Protection and Gmail image proxy inflate or block it); in-app `read_at` is the trustworthy signal
- `track_token` prevents recipient-ID enumeration on the public pixel endpoint
- All new tables/columns get explicit `GRANT` statements; RLS scoped to `auth.uid()` via the operators join
- No edits to `src/integrations/supabase/client.ts`, `types.ts`, `.env`, or `supabase/config.toml` project-level settings (the two new functions get added to `[functions]` entries)

## Decision
Approve to start with Phase 1. Phase 2 follows immediately after in a separate turn so each phase stays reviewable.
