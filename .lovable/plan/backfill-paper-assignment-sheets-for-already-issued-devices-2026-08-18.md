# Backfill paper Assignment Sheets for already-issued devices

## What's true today (verified)
- The Create Sheet modal only lists devices with inventory status `available`, and the `send-osas-to-operator` function rejects anything else with "Serial X is not available (assigned)".
- 153 devices are currently `assigned`, but only 3 of them appear on any assignment sheet — 150 paper-era devices have no digital record and no way to get one.
- A sheet can only be saved as a Draft or emailed for e-signature; there is no way to record that a paper sheet was already signed, and no place to store the scanned original.
- "Send Return Instructions" is already available on any sheet regardless of status, so backfilled sheets get that for free.

## What will change

**1. Create Sheet gets a "Record paper sheet" mode**
A toggle at the top of the Create Sheet modal: *New assignment* (today's behavior) or *Record existing paper sheet*.

In paper mode:
- The device dropdowns list the devices **currently assigned to the selected driver** (in addition to available stock), so the sheet matches what they already hold.
- Inventory status is not changed and no duplicate assignment record is created — the device stays assigned to that driver exactly as it is now.
- Assignment Date is the date on the paper sheet.
- New fields: **Signed date** (required) and **Upload signed sheet** (PDF or JPG/PNG, required) — the scan of the original.
- No email is sent to the driver. The single action button is "Save Paper Sheet".

**2. The sheet is stored as Signed, marked as paper**
The sheet is saved with status Signed, the signed date you entered, the uploaded file attached, and a record of which staff member logged it and when. Nothing is emailed.

**3. "Paper original" badge**
An amber "Paper original" badge appears next to the status badge in the Assignment Sheets list and on the sheet preview, with a "View original" button that opens the scan in the in-app file viewer. The preview shows "Signed on paper — original on file" instead of a drawn signature.

**4. Return instructions work unchanged**
Backfilled sheets appear in the Signed tab and can be sent return instructions, tracked, and closed out with a driver-uploaded receipt exactly like digital sheets.

## Technical details
- `onboard_assignment_sheets`: add `is_paper_original boolean not null default false`, `paper_scan_path text`, `paper_scan_name text`, `recorded_by uuid`, `recorded_by_name text`, `recorded_at timestamptz`. No new table needed.
- Scan files go into the existing private `operator-documents` bucket under `osas-paper/<operator_id>/<sheet_id>/`, read through a signed URL by the existing `FilePreviewModal`.
- `send-osas-to-operator`: accept `paperOriginal: true`. On that path, skip the `status !== 'available'` rejection for devices already assigned to the same operator, skip the equipment status update and the `equipment_assignments` insert, write `status = 'signed'` with `signed_at` from the entered date, and skip all email + `onboard_assignment_sheet_sends` logging. Devices assigned to a *different* operator are still rejected.
- Audit: log `osas_paper_sheet_recorded` to `audit_log` with sheet id, operator, device serials, and signed date.
- `CreateSignOffSheetModal.tsx`: mode toggle, device options sourced from open `equipment_assignments` rows for the selected driver, signed-date + file upload fields with validation (10MB; pdf/jpg/png), single save action.
- `SignOffSheetList.tsx` and `SignOffSheetPreviewModal.tsx`: badge, "View original" button, paper signature block.