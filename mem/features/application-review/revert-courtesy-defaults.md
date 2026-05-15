---
name: Revert Courtesy Email Defaults
description: Per-role default for the "send courtesy email" checkbox in the revert-revision-request modal
type: feature
---
Table `revert_courtesy_email_defaults` (PK = `app_role`, `send_by_default boolean`) drives the initial value of the "send please-disregard email" checkbox in `RevertRevisionModal`.

- Read: any staff (RLS via `is_staff`).
- Write: `management` or `owner` only.
- Seeded: owner=ON, management=ON, onboarding_staff=OFF, dispatcher=OFF.
- Modal picks the highest-priority role of the caller (owner > management > onboarding_staff > dispatcher) to look up the default.
- Edited via `RevertCourtesyDefaultsCard` mounted in Management Portal → Carrier Signature view (`?view=carrier-signature`). Saving writes one `audit_log` row with `action = 'revert_courtesy_defaults_updated'`, `entity_type = 'settings'`, `metadata = { before, after }`.
- The `revert-application-revisions` edge function receives an explicit boolean — the default lives client-side.

## Persistent "Reverted" banner (audit-log driven)

After a successful revert, `RevertRevisionModal.onSuccess` no longer closes the drawer. Instead, `ApplicationReviewDrawer` renders `<RevertedBanner />` which queries the most recent `audit_log` row where `action = 'revision_request_reverted'` for that application and renders for 24h:
- **Green** (`status-success`) when `metadata.courtesy_email_sent === true`
- **Amber** when courtesy email was requested but failed — shows error reason + a "Retry email" button
- **Neutral** (`muted`) when no courtesy email was requested

"Retry email" re-invokes `revert-application-revisions` with `{ retryEmailOnly: true, sendCourtesyEmail: true }`. In that mode the function skips the status revert + token invalidation, only re-sends the courtesy email, and inserts a fresh `audit_log` row with the same `action` so the banner reads the new outcome. Audit metadata also includes `courtesy_email_requested` and `retry_email_only` flags.

The amber "Revisions requested" banner is suppressed locally via a `justReverted` flag once the modal succeeds, so the green/amber/neutral banner is the only one shown post-revert (regardless of whether the parent has refetched).
