# Preview Return Instructions Before Sending

## Current state

No. Today the only step before sending is a confirmation dialog. In Onboard Systems > Assignment Sheets, "Send return instructions" calls the `send-equipment-return-instructions` function immediately, which renders the email template and mails the driver in one shot. The only rendering of that template that exists is an internal, all-templates preview endpoint gated to Lovable's own API key with canned sample data — staff cannot reach it, and it doesn't use real driver/sheet data.

## What to build

A "Preview" step in the same dialog that shows the exact email the driver will receive, using that sheet's real data (driver name, unit number, returnable device list with serials, portal link), then a Send button underneath.

Flow:
1. Staff clicks "Send return instructions" on a sheet.
2. The dialog opens and immediately loads the rendered email.
3. Staff sees the real email body in a scrollable frame, plus the subject line and recipient address.
4. Buttons: Cancel / Send to driver. Nothing is sent and the sheet is not stamped as "return requested" until Send is pressed.

## Technical notes

- Add a `preview: true` mode to `supabase/functions/send-equipment-return-instructions/index.ts`. It reuses the existing sheet lookup and template-data building, renders the `equipment-return-instructions` template to HTML with `renderAsync`, and returns `{ html, subject, recipient, items }` without sending the email and without stamping `return_requested_at`. Same staff role gate as the send path.
- Refactor the function so the sheet fetch and `templateData` construction happen once and feed both branches, so the preview cannot drift from what actually sends.
- In `src/components/equipment/SignOffSheetList.tsx`, expand the existing return-confirm dialog into a preview dialog: fetch on open, show a loading state, render the HTML in a sandboxed iframe (`srcDoc`) so email styles don't leak into the app, show subject + recipient above it, and keep the existing send handler on the confirm button.
- `src/components/management/DeactivationWizardContent.tsx` also triggers return instructions; its behavior stays unchanged unless you want the preview there too.