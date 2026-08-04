# Fix roadside binder email authorization and delayed errors

## Goal
Make **Email this page** and **Email all docs** work for the driver’s own 3-ring binder, and ensure any genuine failure is shown immediately instead of appearing only after the flipbook closes.

## Confirmed diagnosis
- `inspection_documents.driver_id` consistently stores the driver’s authenticated user ID; all 698 per-driver document rows follow that convention.
- The failed request authenticated correctly and resolved all 9 requested documents, but the email function compared each document’s `driver_id` with the caller’s operator record ID. That mismatch caused the incorrect “not in your binder” rejection before the email send step.
- The current global error toast sits behind the full-screen flipbook layer, so the failure is only exposed after leaving the flipbook.

## Implementation
1. **Correct backend ownership validation**
   - Authorize a driver-owned document by comparing `inspection_documents.driver_id` directly with the authenticated user ID.
   - Keep company-wide documents shareable and retain the existing staff authorization path.
   - Do not trust any client-supplied driver or owner ID.

2. **Make email failures visible inside the flipbook**
   - Add an inline error state to the email dialog so backend failures appear immediately where the user pressed **Send email**.
   - Clear stale errors when reopening or retrying the dialog.
   - Keep the button’s sending state bounded by the existing timeout and always restore it after success or failure.

3. **Add regression coverage**
   - Cover driver-owned, company-wide, another driver’s document, and authorized staff-sharing cases.
   - Confirm a caller-supplied alternative owner cannot affect authorization.

4. **Deploy and verify the real flow**
   - Deploy the corrected email function.
   - Send the complete 9-document flipbook while signed in as the affected driver and confirm the function reaches the email-send step and records a successful send.
   - Verify a document belonging to another driver is still rejected and that the rejection appears inside the open email dialog.

## Technical scope
- Update `supabase/functions/send-binder-share/index.ts` for the ownership-key correction.
- Update `src/components/inspection/BinderFlipbook.tsx` for immediate inline error feedback.
- Add focused tests using the project’s existing test conventions.