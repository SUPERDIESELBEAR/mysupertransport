# Truck Owner Accounts (Owner-Operated by Third Party)

A new account type for the person/company that owns a truck leased to SUPERTRANSPORT but does not drive it. The driver still completes the application; the owner gets their own SUPERDRIVE login, signs the ICA, and has full visibility into their truck's onboarding/operations.

## High-level model

- One **truck owner** is linked to one **operator (driver)**. Strict 1:1 in v1 (we can lift later if needed).
- Owner is its own login (separate `auth.users` + `profiles`), but is **not** an `operators` row. Driver remains the `operators` row that everything else hangs off of.
- Owner sees a portal scoped to **their** linked operator with the same data the driver sees (compliance, ICA, documents, equipment, dispatch status, pay setup, messages — full driver parity for their truck).
- Owner signs ICA. After full execution, the driver gets a "Read & Acknowledge ICA" task patterned after the payroll acknowledgment.

## What's new for users

### Management portal
- New section on the operator detail view: **"Truck Owner"** card.
  - If none: "Add Truck Owner" button → modal capturing legal name, business name, email, phone, mailing address.
  - On save, staff can click **"Invite Owner to SUPERDRIVE"** → emails a one-time signup link that creates the auth user, assigns the `truck_owner` role, and pre-links them to this operator.
  - Once linked: shows owner name, contact, invite/last-login status, and a **"Resend invite"** action.
- Existing **ICA Builder** auto-populates owner fields from this record when the operator has a linked truck owner; the "send to operator" action now sends to the **owner's** email instead of the driver's.

### Truck owner's SUPERDRIVE portal (new)
- Same layout/look as the operator portal, but every screen is scoped to their linked driver/truck.
- Tabs: **Onboarding · Documents · ICA · Equipment · Dispatch · Pay · Messages** (full driver parity).
- Owner can upload owner/truck-side documents (Truck Title, Form 2290, COI, W9, truck photos, inspection) — these land in the same `operator_documents` rows the driver would have uploaded.
- ICA tab shows the standard signing screen (same `OperatorICASign` flow), with a small set of editable fields above the signature (address, phone, email) before signing.

### Driver's portal
- New "Read & Acknowledge ICA" task appears once the owner fully executes the ICA. Same UX as payroll-doc acknowledgment: view PDF → check "I have read and understand" → timestamped record. Until acknowledged, an info banner appears on the ICA tab ("Your truck owner has signed your ICA — please read and acknowledge").

## Technical plan

### Database
- New enum value: `app_role.truck_owner`.
- New table `public.truck_owners`:
  - `operator_id uuid UNIQUE REFERENCES operators(id) ON DELETE CASCADE` (enforces 1:1)
  - `user_id uuid REFERENCES auth.users(id)` (nullable until invite accepted)
  - `legal_first_name`, `legal_last_name`, `business_name`, `email`, `phone`
  - `address_street`, `address_city`, `address_state`, `address_zip`
  - `invited_at`, `invite_accepted_at`, `created_by`, plus timestamps
  - GRANT to `authenticated` + `service_role`; RLS: staff full access; owner can read their own row.
- New table `public.ica_driver_acknowledgments`:
  - `contract_id uuid REFERENCES ica_contracts(id) ON DELETE CASCADE`
  - `driver_user_id uuid REFERENCES auth.users(id)`
  - `acknowledged_at timestamptz`
  - Unique on (contract_id, driver_user_id). Same GRANT/RLS pattern.
- Helper SECURITY DEFINER fn `public.is_truck_owner_for_operator(_uid uuid, _operator_id uuid) returns boolean` — used by RLS on all driver-scoped tables (operators, onboarding_status, operator_documents, ica_contracts, equipment_assignments, contractor_pay_setup, messages, etc.) to grant the owner the same SELECT/UPDATE rights the driver currently has on their own data.
- Update `enforce_ica_contracts_operator_update` trigger to also allow the linked truck owner (not just `is_staff` / operator user) to set contractor signature fields and limited editable fields (owner address/phone/email).
- Update `log_ica_event` to accept the truck owner as a valid caller for the linked operator.
- Update `assign_user_role` to permit assigning `truck_owner` (currently blocks only `owner`).

### Edge functions
- New `invite-truck-owner` function:
  - Auth: `getClaims(token)` + `is_staff` check (multi-role `.limit(1)` pattern).
  - Creates auth user (or reuses existing by email), assigns `truck_owner` role, upserts `truck_owners` row, sends invite email with magic signup link.
- Update `send-notification` / milestone hook so:
  - `ica_ready_to_sign` notification goes to the **owner** when one exists, otherwise the driver (current behavior).
  - On `ica_complete`, also create a `driver_acknowledge_ica` notification for the driver.

### Frontend
- New route `/owner` rendering `TruckOwnerPortal.tsx`, which composes the existing operator portal components but resolves `operatorId` via `truck_owners.user_id = auth.uid()` instead of `operators.user_id`.
- Auth/role plumbing in `useAuth.tsx`: add `isTruckOwner` flag; landing page (`/dashboard`) routes truck owners to `/owner`.
- `OperatorICASign.tsx`: when the signer is the truck owner, allow editing the limited owner fields (address/phone/email) inline above the signature canvas and persist them on the `ica_contracts` row alongside the signature.
- New `DriverICAAcknowledgment.tsx` component shown on the driver's ICA tab when `status = fully_executed` and no row exists in `ica_driver_acknowledgments` for them.
- Management portal:
  - New `TruckOwnerCard.tsx` on the operator detail view with add/edit/invite/resend actions.
  - ICA Builder pulls owner contact fields from `truck_owners` when present; recipient picker defaults to the owner.

### Notifications & audit
- Audit log entries for: `truck_owner_created`, `truck_owner_invited`, `truck_owner_invite_accepted`, `ica_driver_acknowledged`.
- Reuse existing `log_ica_event` RPC for owner-initiated signing events.

## Out of scope (v1)
- Many-to-many owner↔driver (one owner, multiple trucks/drivers). Schema allows future extension via dropping the UNIQUE constraint and adding a join table; not built now.
- Owner-initiated messaging to driver (owner ↔ staff only via existing message threads scoped to the operator).
- Owner-driven application invites (staff captures owner info post-application, per your decision).
- Owner self-service to change their linked driver/truck (staff-managed only).

## Rollout
1. Migration (enum value + tables + helper fn + RLS updates + trigger changes).
2. Edge function `invite-truck-owner` + notification routing tweaks.
3. Management `TruckOwnerCard` + ICA Builder owner pre-fill.
4. `/owner` portal route + auth routing.
5. Driver ICA acknowledgment task.
6. QA with a sandbox operator + owner pair before enabling for live operators.
