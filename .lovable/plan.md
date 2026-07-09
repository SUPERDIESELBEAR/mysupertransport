# Return Equipment Mailing Flow

## Confirmed with user
- **Trigger:** manual "Send Return Instructions" button on the staff Operator page (no auto-fire on termination/deactivation).
- **Delivery:** email only — no in-app banner.
- **Address:** both addresses shown; driver picks either, uploads a receipt with tracking.
- **Access after departure:** driver login stays active until at least one return receipt is on file (or staff overrides).

## What already exists (verified — no rebuild)
- `EquipmentAssetSheet.tsx` already shows a **Return Shipment Receipts** block to the driver when any equipment line's `*_delivery_method = 'awaiting_return'`. Driver can upload a receipt image/PDF with carrier + tracking number. Files land in `operator-documents` and rows in `equipment_receipts` (`direction = 'return'`). Management sees the same block read/write.

## What we'll build

### 1. "Send Return Instructions" staff action
- Add a button on `OperatorDetailPanel.tsx` in the Stage 5 / Equipment area, visible for any operator that has ≥ 1 assigned device.
- Clicking it:
  1. Flips every currently-assigned device line to `*_delivery_method = 'awaiting_return'` (skipping lines already marked returned) so the driver's Asset Sheet immediately surfaces the return-receipt uploader.
  2. Stamps `return_instructions_sent_at` / `return_instructions_sent_by` on `onboarding_status` (new columns).
  3. Invokes a new edge function `send-equipment-return-instructions` to email the driver.
- Confirmation modal lists which devices will be flagged for return before sending; re-send is allowed and re-stamps the timestamp.

### 2. Email
- New edge function `supabase/functions/send-equipment-return-instructions/index.ts` using existing Resend connector pattern.
- To: driver's email on `applications`. Reply-to: sender staff email.
- Body includes:
  - Personalized greeting + short instructions ("mail back within X days, include tracking").
  - Table of equipment to return (label + serial) pulled from `onboarding_status`.
  - **Both mailing addresses** side by side:
    - **The UPS Store #4564** — 608 W. Parkway Dr., Russellville, AR 72801 (hours + phone).
    - **USPS** — SuperTransport c/o Craig Pate, P.O. Box 718, Dover, AR 72837.
  - Deep link back to the driver Asset Sheet upload screen (existing `OperatorPortal` route).
  - Reminder that they must attach the shipping receipt + tracking number after mailing.
- Log the send to `email_send_log` following the project's existing pattern.

### 3. Keep-login-alive guard
- New helper column `equipment_return_completed_at` on `onboarding_status` (nullable).
- Migration adds a trigger on `equipment_receipts`: on the first `direction='return'` insert for an operator, set `equipment_return_completed_at = now()` (if null).
- Update the existing operator deactivation logic (in `on_operator_deactivated` trigger — referenced in memory) so that when an operator is set inactive/archived:
  - If `return_instructions_sent_at IS NOT NULL AND equipment_return_completed_at IS NULL`, keep their auth account enabled and set a new flag `login_retained_for_return = true`.
  - Once the return receipt lands (trigger above fires), a follow-up trigger clears `login_retained_for_return` and applies the normal deactivation side effects.
- Staff override: small "Force close return window" button on the same card that clears `login_retained_for_return` and finishes deactivation manually.
- Login gate in `useAuth` / route guards: allow sign-in for inactive operators only when `login_retained_for_return = true`, and restrict them to the Asset Sheet view (rest of the driver portal shows a "Your account is closed — please finish returning equipment" screen).

### 4. Small UI polish on Asset Sheet
- When `return_instructions_sent_at` is set, show a compact "Return instructions emailed on <date>" line at the top of the Return Shipment Receipts block for both roles. No behavior change to the existing uploader.

## Technical notes
- Migration: add `return_instructions_sent_at timestamptz`, `return_instructions_sent_by uuid`, `equipment_return_completed_at timestamptz`, `login_retained_for_return boolean default false` to `onboarding_status`; add trigger `mark_equipment_return_completed` on `equipment_receipts`; amend `on_operator_deactivated` to respect the new flag.
- Addresses stored as constants in the edge function (not in DB) since they're fixed company addresses; easy to edit later.
- Reuse existing `email_send_log` + Resend gateway pattern (no new secrets needed if Resend is already connected).

## Out of scope
- Automatic termination trigger (user chose manual only).
- Driver preference selection UI for UPS vs USPS.
- SMS notification.
