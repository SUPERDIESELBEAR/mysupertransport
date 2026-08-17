# Add CDL Number to Assignment Sheets (OSAS)

When staff pick a driver while creating an Onboard Systems Assignment Sheet, the driver's CDL details are pulled in automatically and carried through to every copy of the sheet.

## What changes

1. **Create Sign-off Sheet modal** — after selecting a driver, the driver info card shows a new line:
   `CDL: D123456789 (MO) · Exp 03/14/2028`.
   Read-only (pulled from the driver's application record). If no CDL number is on file, the card shows an amber warning line ("No CDL number on file for this driver") but saving/sending is still allowed.

2. **Snapshot on save** — the CDL number, state, and expiration are stored on the sheet itself when it is created, so the sheet keeps the values that were true at issue time (same approach already used for unit number).

3. **Staff preview modal** — a "CDL Number" field appears next to Unit Number in the sheet header block.

4. **Driver signing page** — CDL shown in the sheet header alongside Unit and Assignment date.

5. **Signed PDF / emailed copy** — CDL line included in the document header so the archived and emailed copies match.

## Technical notes

- Migration: add `cdl_number text`, `cdl_state text`, `cdl_expiration date` to `public.onboard_assignment_sheets` (all nullable, no grant/RLS changes needed — existing table policies apply).
- `CreateSignOffSheetModal.tsx`: extend the `operators` query to select `cdl_number, cdl_state, cdl_expiration` from `applications`, add them to `OperatorOption`, render in the driver card, and include them in `buildPayload()`.
- Existing sheets keep null CDL fields and render `—`.
- Display format: `NUMBER (STATE) · Exp MM/DD/YYYY`, with each part omitted if absent. Dates parsed with the project's noon-anchor rule.
- Touched files: new migration, `src/components/equipment/CreateSignOffSheetModal.tsx`, `SignOffSheetPreviewModal.tsx`, `src/components/operator/OperatorOSASSign.tsx`, and the OSAS sheet document/PDF renderer used by `send-osas-to-operator`.
