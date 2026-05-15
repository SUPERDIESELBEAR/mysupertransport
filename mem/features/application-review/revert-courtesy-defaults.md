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
- The `revert-application-revisions` edge function is unchanged — the default lives client-side, the function still receives an explicit boolean.
