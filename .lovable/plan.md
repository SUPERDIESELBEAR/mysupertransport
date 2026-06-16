# Fix Notification "View" Button

## Problem
1. The View button on the QPassport notification does nothing because the resolver queries `onboarding_status` by `user_id`, but that table is keyed by `operator_id` (which maps to `operators.id`, not the auth user id). The query silently returns null, the resolver falls back to `navigate(n.link)`, and `'/operator?tab=progress#qpassport'` doesn't open the file inline.
2. "View" currently appears on every notification that has a `link`, even when there's no file to view (e.g. "Drug Screening Scheduled"). Per the request, "View" should appear only on notifications that have an actual attached document.

## Changes

All edits in `src/components/management/NotificationHistory.tsx` — no backend changes.

### 1. Fix the QPassport resolver
Change the `qpassport_uploaded` resolver to do a two-step lookup:
- Look up `operators.id` where `operators.user_id = :authUserId`.
- Then read `onboarding_status.qpassport_url` where `operator_id = :operatorId`.
- Return `{ url, name: 'QPassport.pdf' }` or `null`.

This matches the access pattern already used by `PEScreeningTimeline` / `OperatorStatusPage` for the same file, so RLS already permits it for the signed-in operator.

### 2. Restrict the "View" button to attachment-backed notifications
- Compute `hasAttachment = !!ATTACHMENT_RESOLVERS[n.type]`.
- Change the render condition from `showCta = !!n.link || hasAttachment` to `showCta = hasAttachment`. Both the desktop and mobile expanded rows use this flag.
- Notifications that only deep-link (e.g. "Drug Screening Scheduled", `onboarding_milestone`, `new_message`) will expand to show the full body but will no longer show a button.

### 3. Better failure messaging
If the resolver runs but returns `null` (file genuinely missing), keep the existing toast ("File not available") instead of silently navigating. Drop the `navigate(n.link)` fallback inside `handleView` since the button now only renders for attachment types.

## Forward compatibility
The `ATTACHMENT_RESOLVERS` map is the single extension point. Any future notification type that has a real file just needs one entry added (type → async function returning `{ url, name }`) and the same expand → "View" → inline `FilePreviewModal` flow will work automatically.

## Out of scope
- No edits to `send-notification`, `PEScreeningTimeline`, `OperatorStatusPage`, or storage policies.
- No new resolvers beyond `qpassport_uploaded` in this pass.
