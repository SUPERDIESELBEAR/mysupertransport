# Passenger Authorization — stop pending requests from stacking

## Recommendation

Do **not** limit a driver to one Passenger Authorization. A driver can legitimately have several over time (different passengers, renewals after the 1-year expiration), and each signed one is a compliance record that must be kept.

The real problem is **unsigned/pending requests piling up**. So the rule is:

> A driver may have unlimited *signed* authorizations, but only **one open (pending) request at a time**.

Everything else follows from that.

## What to build

**1. One open request per driver (send-side guard)**
When staff sends a Passenger Authorization to a driver who already has an open request (`sent` or `opened`), the send dialog warns:

- "Marcus Mueller already has an open request from 7/21 that hasn't been signed."
- Choices: **Resend the existing link** (re-emails the same request, no new row, no new card) or **Replace it** (revokes the old one and issues a fresh request).

This makes accidental stacking impossible going forward, while still allowing a genuine new request for a different passenger — staff just explicitly replaces or waits until the current one is signed.

**2. Staff management list (Passenger Authorizations panel)**
A list in the management portal showing every authorization with driver, unit, passenger name, status, sent/signed/expiration dates, and actions:

- **Resend** — re-email the existing link
- **Revoke** — cancels a pending request; the driver's home card disappears; the record stays in history as `revoked`
- **View PDF** — for signed ones
- **Send new** — the existing send dialog

Signed records are never deletable from here (compliance), only revocable while pending.

**3. Driver home card cleanup**
- The card only shows requests in `sent`/`opened` status (already true) — with rule 1 in place, that's at most one card.
- Revoking a pending request also dismisses its in-app notification, so the bell doesn't keep an orphan task.
- If any stacked duplicates ever exist, the card groups them and shows only the newest, with the older ones auto-revoked.

**4. Renewal support (natural follow-on)**
Since signed authorizations expire 1 year after the effective date, the staff list flags ones expiring within 60 days with a **Send renewal** action — which is just a fresh request, allowed because the prior one is signed, not pending.

## Cleanup of Marcus Mueller's existing 4

Revoke the 3 older pending requests and keep the newest. Cards drop from 4 to 1, and the revoked rows stay visible in the staff list as history. (Say the word if you'd rather delete them outright — but revoking preserves the audit trail, which is the safer default.)

## Technical notes

- `passenger_authorizations.status` already supports `revoked`; `get-passenger-auth` and `finalize-passenger-auth` already reject revoked tokens, so no token-security work is needed.
- New edge functions: `revoke-passenger-auth` (staff-only, sets `revoked` + dismisses the related notification) and a resend path added to `send-passenger-auth` (accepts an existing `authorizationId` and re-emails rather than inserting).
- `send-passenger-auth` gains a pre-insert check for an existing `sent`/`opened` row for the same operator, returning a conflict the modal can act on.
- New component `PassengerAuthorizationsPanel.tsx` in the management portal; `SendPassengerAuthModal.tsx` gains the conflict prompt.
- No schema change expected beyond an index on `(operator_id, status)`; revocation is a data update, not a migration.
