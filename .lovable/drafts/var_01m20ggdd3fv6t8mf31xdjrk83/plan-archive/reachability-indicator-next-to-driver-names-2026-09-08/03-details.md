## What gets built

### 1. Shared reachability helper

The reason logic currently lives inside `MessageReachabilityCard.tsx` (`blockReason`). It moves into `src/lib/messagingAudience.ts` as `reachabilityBlock(candidate, accountStatus)` returning `null` (reachable) or a short reason string. The settings card is refactored to use it — one definition of "reachable" everywhere.

### 2. Account status in the shared loader

`loadDMCandidates()` already loads profiles for names; it adds `account_status` so every candidate carries enough to answer reachability without an extra query per screen.

### 3. Indicator component

A tiny `ReachabilityBadge` component (avatar-corner check / warning triangle with a tooltip giving the reason) in `src/components/messaging/`, used by:

- `MessagesView.tsx` — the conversation list
- `NewDirectMessageModal.tsx` — the person picker
- `NewGroupModal.tsx` — group candidates
- `BulkMessageModal.tsx` — recipient rows, plus the "N of M selected cannot receive messages" summary line

### 4. Tooltip, not clutter

Reason text appears on hover (desktop) and tap (mobile) via the existing tooltip pattern — no permanent extra text in the list.

## Out of scope

No change to who is *allowed* to be sent a message, no RLS or policy changes, no email-bounce detection (the indicator reflects in-app reachability only, same as the settings card).

## Technical notes

- `src/lib/messagingAudience.ts` gains `reachabilityBlock()`; `blockReason` in `MessageReachabilityCard.tsx` is deleted and the card calls the shared helper.
- `loadDMCandidates()` in `NewDirectMessageModal.tsx` selects `account_status` alongside the existing profile fields and exposes it on `DMCandidate`.
- New `src/components/messaging/ReachabilityBadge.tsx` renders nothing when reachable in dense pickers (Bulk Message, New message) and the green check in the main conversation list; always renders the amber triangle when blocked, with `title`/tooltip reason.
- `BulkMessageModal.tsx` computes blocked-selected count in the recipient step and renders the summary line.
- Verify with typecheck plus the messaging-related tests; confirm the indicator and the settings card report the same people on live data.
