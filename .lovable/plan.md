# AI Invoice Autofill — Add Maintenance Record

Add a "Scan invoice with AI" button to the Add Maintenance Record modal in the Vehicle Hub. Staff uploads a PDF or photo of an invoice (e.g. Love's, TA, independent shop), Gemini reads it via the Lovable AI Gateway, and prefills the form fields. Staff reviews and clicks Save.

## User flow

1. Staff opens **Vehicle Hub → Log Update → Repair / Maintenance**.
2. At the top of the modal, a new **"Scan invoice with AI"** button (paperclip + sparkle icon) opens a file picker (PDF, JPG, PNG, HEIC).
3. While parsing, a small progress state shows *"Reading invoice…"*.
4. Extracted values prefill the form fields; the same file auto-attaches as the invoice upload.
5. Any field the AI couldn't confidently determine is left blank with a subtle hint.
6. Staff reviews, edits if needed, and clicks **Save Record** as normal.

## Fields the AI extracts

| Form field | Source on invoice |
| --- | --- |
| Service Date | Invoice / service date |
| Odometer | Miles / odometer reading |
| Shop Name | Vendor name (e.g. "Love's Travel Stop #614") |
| Amount ($) | Invoice total |
| Invoice # | Invoice / receipt number |
| Category | Inferred from line items: PM Service, General Repair, or Tires (multi-select allowed) |
| Description of Work | Short summary of the line items |

Fields left untouched: Notes (staff-only field).

## Technical details

**Edge function** — `supabase/functions/parse-maintenance-invoice/index.ts`
- Auth: verify staff JWT via `getClaims(token)` per project pattern.
- Input: base64 file + mime type (from the client).
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) using the multimodal chat completions endpoint with either an `image_url` block (photos) or `file` block (PDFs), and a strict JSON schema response for the fields above.
- Returns `{ service_date, odometer, shop_name, amount, invoice_number, categories, description }` with any unknown field set to `null`.
- Handles gateway 429 / 402 by surfacing a clear error to the client.

**Client changes** — `src/components/fleet/MaintenanceRecordModal.tsx`
- Add a "Scan invoice with AI" button at the top of the form.
- On file selection: read the file as base64, invoke the edge function, prefill state, and set `invoiceFile` so the same file uploads on Save.
- Show a small "Filled by AI — please review" pill after prefill.
- Existing manual entry, validation, and Save flow are unchanged.

**No schema or RLS changes** — reuses `truck_maintenance_records` and the existing `fleet-documents` bucket.

## Out of scope for this iteration

- DOT Inspection modal autofill.
- Driver-side receipt scanning.
- Auto-save without staff review.

Both can be layered on later using the same edge function.
