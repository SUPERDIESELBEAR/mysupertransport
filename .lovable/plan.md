## Goal

After a successful "Undo — sent in error" revert, replace the amber "Revisions requested" banner with a persistent **"Reverted"** confirmation banner that shows the exact restored status and the courtesy-email outcome. The banner is sourced from `audit_log` so it survives drawer reopens for ~24h.

## Behavior

1. **Drawer stays open** after revert (remove the `onClose()` from `onSuccess`).
2. **Banner swaps** from amber "Revisions requested" → colored "Reverted" banner driven by the most recent `revision_request_reverted` audit row for that application.
3. **Banner auto-disappears** when the audit row is older than 24h (review_status will already be back to `pending`/`approved`, so the standard UI takes over).

## Banner variants (driven by `metadata.courtesy_email_sent` + `courtesy_email_error`)

| Outcome | Color | Copy | Action |
|---|---|---|---|
| Email sent | Green (`status-success`) | "Reverted to {Restored Status} on {date} by {actor} · Courtesy email sent to applicant" | "Dismiss" link |
| Email failed | Amber (`status-warning`) | "Reverted to {Restored Status} · Courtesy email **failed to send** — message {firstName} manually" + error reason in muted text | "Retry email" button + "Dismiss" |
| Email not requested | Neutral (`muted`) | "Reverted to {Restored Status} on {date} by {actor} · No courtesy email sent" | "Dismiss" link |

"Dismiss" hides the banner for the rest of this drawer session (local state only; reopening the drawer within 24h shows it again).

## Implementation

### 1. New component: `src/components/management/RevertedBanner.tsx`
- Props: `applicationId`, `firstName`, `onRetryEmail`.
- On mount: query `audit_log` for the most recent row where `entity_type='application'`, `entity_id=applicationId`, `action='revision_request_reverted'`, ordered by `created_at desc`, `limit(1)`.
- Skip render if: no row found, row older than 24h, or user dismissed locally.
- Render variant based on `metadata.courtesy_email_sent` / `metadata.courtesy_email_error`.
- "Retry email" button → calls a new helper that re-invokes `revert-application-revisions` edge function with `{ applicationId, sendCourtesyEmail: true, retryEmailOnly: true }`. On success, refetches the audit row.

### 2. Edge function: `supabase/functions/revert-application-revisions/index.ts`
- Accept new optional flag `retryEmailOnly: boolean`.
- When `retryEmailOnly === true`: skip the status revert + token invalidation; only re-run the courtesy email block; insert a fresh `audit_log` row with same `action` (so the banner reads the latest result).
- Returns same `{ courtesyEmailSent, courtesyEmailError }` shape.

### 3. `ApplicationReviewDrawer.tsx`
- Always render `<RevertedBanner />` above (or in place of) the existing revisions banner.
- Keep the existing amber banner only when `review_status === 'revisions_requested'` AND no recent reverted-audit row exists (i.e., RevertedBanner returns null).
- Change `onSuccess` of `<RevertRevisionModal>` to **not** close the drawer — just close the modal, refetch the application (so `review_status` updates), and trigger RevertedBanner to refetch.

### 4. `RevertRevisionModal.tsx`
- Keep existing toast (transient confirmation).
- After success, call a new optional `onReverted()` prop (in addition to existing `onSuccess`) so the drawer can refresh both the application row and the audit-log query without closing.

### 5. Memory
- Update `mem://features/application-review/revert-courtesy-defaults.md` with the persistent banner + retry behavior.

## Out of scope
- No new database tables (audit_log already exists).
- No changes to the courtesy-defaults table or settings card.
- No additional toast variants.
