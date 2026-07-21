## Goal

Surface Passenger Authorization requests inside the SUPERDRIVE driver app alongside the existing email, so drivers can complete Authorization #1 from either entry point.

## How it works today

- Staff clicks **Send to driver** → `send-passenger-auth` inserts a `passenger_authorizations` row (with `response_token`) and emails the driver a link to `/passenger-auth/:token`.
- That route already renders the fillable/signing page inside the app. There is no in-app surfacing — a driver who opens SUPERDRIVE directly sees nothing about the pending request.

## What to build

### 1. In-app notification on send
In `send-passenger-auth`, after inserting the row, when `operator_id` is present:
- Look up the operator's `auth_user_id`.
- Insert a row into `notifications` (existing table) with:
  - `title`: "Passenger Authorization required"
  - `body`: "Complete Authorization #1 for Unit {unit_number} and sign the form."
  - `action_url`: `/passenger-auth/{response_token}`
  - `priority`: high
  - category/type consistent with existing driver-facing notifications
- Email still sends as it does today (both paths).

### 2. Pending task card in the Driver Hub
Add a lightweight "Action needed" card to the operator portal (Home / Dashboard view — the same surface that shows onboarding tasks) that queries `passenger_authorizations` where:
- `operator_id = current operator`
- `status IN ('sent','opened')` (i.e. not yet completed/revoked)

Card shows: "Passenger Authorization – Unit {unit}" with a "Open form →" button that routes to `/passenger-auth/:token`. Card auto-disappears once status becomes `completed`.

### 3. Update the email copy
Change the wording under the email field in `SendPassengerAuthModal.tsx` from "The driver will receive an email link…" to:

> "The driver will get an in-app task in SUPERDRIVE **and** an email link to complete Authorization #1 and sign the form. Carrier signature and Driver Hub filing happen automatically."

### 4. Manual-entry case (no operator selected)
If staff types the driver in manually (no `operatorId`), only the email is sent — there's no operator account to attach an in-app task to. This matches today's behavior; the modal copy will note "in-app task requires a linked driver profile."

## Files to touch

**Backend**
- `supabase/functions/send-passenger-auth/index.ts` — insert `notifications` row when `operator_id` is set; resolve operator's `auth_user_id`.

**Frontend**
- `src/components/management/SendPassengerAuthModal.tsx` — updated helper copy.
- `src/pages/operator/OperatorPortal.tsx` (or the appropriate Home/Dashboard component it renders) — add pending Passenger Authorization card, wired to a small query hook.
- New: `src/components/operator/PendingPassengerAuthCard.tsx` — the card component + query.

**No schema changes.** `passenger_authorizations` and `notifications` already exist.

## Out of scope

- Push/badge notifications (uses existing in-app notification pipeline only).
- Reminders / re-nudges after N days.
- Staff-side ability to resend or revoke from the driver's row (already available on the Resource Library card).
