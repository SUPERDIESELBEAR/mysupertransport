# Equipment Return Instructions & Receipt Tracking

## Goal
Staff click a button on any cataloged Assignment Sheet (OSAS) to email the driver mailing instructions. The email's button opens the driver app directly on that assignment sheet, where the driver uploads a shipping receipt photo and tracking number. The receipt then appears on the same sheet in the management dashboard, and staff are notified.

## Mailing addresses (already on file, reused as-is)
```text
OPTION 1 — The UPS Store #4564          OPTION 2 — USPS (P.O. Box)
608 W. Parkway Dr.                      SuperTransport
Russellville, AR 72801                  c/o Craig Pate
Mon–Fri 7:30a–6:00p                     P.O. Box 718
Sat 9:00a–2:30p · Sun 10:00a–3:00p      Dover, AR 72837
P: (479) 498-2041
```

## Flow
```text
Staff → [Send Return Instructions] on a sheet
      → email to driver (device list + both addresses + "Open Assignment Sheet" button)
Driver → app deep link → sheet view → Upload Return Receipt (photo + tracking, carrier optional)
      → receipt saved against that sheet
Management → sheet card + preview show receipt thumbnail, tracking #, carrier, date
           → staff notification "Return receipt uploaded"
```

## What gets built

**1. Database**
- Add to `onboard_assignment_sheets`: `return_requested_at`, `return_requested_by`, `return_requested_by_name`, `return_completed_at`.
- Add `sheet_id` (nullable FK) to `equipment_receipts` so a return receipt attaches to a specific sheet; existing rows unaffected.
- Update the driver INSERT policy so a driver may add a `return` receipt when either the existing awaiting-return condition holds **or** one of their sheets has `return_requested_at` set. Require `tracking_number` non-empty for driver-uploaded return receipts (check constraint scoped to `direction = 'return'` + `uploader_role = 'driver'`).
- Trigger on insert of a driver return receipt: stamp `return_completed_at` on the sheet and create a staff notification (reusing the existing notification pattern used for OSAS signing).

**2. Email**
- Reuse the existing `equipment-return-instructions` template; add a prominent CTA button linking to the driver deep link, and populate the device list from the sheet's items (label + serial snapshot).
- New edge function `send-equipment-return-instructions` built on the shared `_shared/email` toolkit (`requireStaff`, CORS, idempotency key that includes a timestamp so resends actually resend). It loads the sheet + items + driver email, enqueues the email, and stamps `return_requested_at`.

**3. Management UI (`SignOffSheetList.tsx` + `SignOffSheetPreviewModal.tsx`)**
- New "Send Return Instructions" button (package icon) on every sheet card, any status. Confirmation dialog naming the driver and email address.
- Once sent: an amber "Return requested — {date}" badge; button label becomes "Resend Return Instructions".
- Once a receipt exists: a green "Return receipt received" panel on the card and in the preview modal, showing carrier, tracking number, upload date, and a clickable thumbnail that opens the existing `FilePreviewModal`.

**4. Driver UI**
- Deep link `/dashboard?view=onboard-systems&sheet={id}&return=1`, which scrolls to that sheet and opens the return-receipt section (same pattern already used for the signature deep link).
- On the driver's Onboard Systems / signed sheet card, when `return_requested_at` is set and no receipt is on file: a "Return Your Equipment" block showing both mailing addresses, plus an upload form — photo/PDF (required), tracking number (required), carrier (optional dropdown: UPS / USPS / FedEx / Other).
- Uploads go through the existing `uploadToBucket` helper into `operator-documents` under `equipment-receipts/{operatorId}/`, then insert into `equipment_receipts` with `sheet_id`, `direction: 'return'`, `uploader_role: 'driver'`.
- After upload the block flips to a receipt confirmation (tracking #, date, thumbnail) — same "stay as a receipt" pattern used after signing.

## Technical notes
- Login access is already gated on at least one return receipt existing via `operator_awaiting_return`; this work adds the sheet-scoped path without weakening that.
- Tracking number is enforced both client-side and by the database check constraint.
- Edge function must be deployed after creation; the email template edit requires redeploying `send-transactional-email`.

## Out of scope (say the word if you want them)
- Automated reminder cadence if no receipt arrives after N days.
- Marking individual devices returned/received from the receipt (still done in Onboard Systems).
