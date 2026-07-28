Current state
- The `public.services` table stores support contact fields: `support_phone`, `support_email`, `support_chat_url`, `support_hours`, and `known_issues_notes`.
- The service "MS Fleet Fuel Card Instructions" has id `3ce86eaa-357b-46ce-8d46-bd383fb72945` and currently has support contact data.
- The management resource center uses `ServiceFormModal.tsx` to edit services, which renders a "Support Contact" section (Phone, Email, Live Chat URL, Support Hours) plus a separate "Tips & Known Issues" textarea.
- The driver-facing service detail page (`ServiceDetailPage.tsx`) renders a support contact card whenever any of those fields are non-null.

Goal
Delete the support contact portion for the MS Fleet Fuel Card Instructions service only.

Plan
1. Database cleanup
   - Write a small migration that nullifies the support contact fields for the single service row:
     ```sql
     UPDATE public.services
     SET support_phone = NULL,
         support_email = NULL,
         support_chat_url = NULL,
         support_hours = NULL,
         known_issues_notes = NULL
     WHERE id = '3ce86eaa-357b-46ce-8d46-bd383fb72945';
     ```
   - This removes the stored data and automatically hides the support contact card on the driver detail page (which only renders when fields are non-null).

2. Hide the form section in the management UI
   - In `src/components/service-library/ServiceFormModal.tsx`, add a guard so the "Support Contact" block is not rendered when the service being edited has id `3ce86eaa-357b-46ce-8d46-bd383fb72945`.
   - Keep the form state/payload as-is; when the fields are hidden, empty values will save as `NULL`, which is consistent with the migration.
   - Leave the "Tips & Known Issues" section visible unless you want it removed too (it is not strictly support contact).

3. Verification
   - Open the management resource center, edit the MS Fleet Fuel Card Instructions service, and confirm the Support Contact fields are gone.
   - Open the driver service detail page for MS Fleet Fuel Card Instructions and confirm no support contact card appears.

Technical details
- One new Supabase migration.
- One small conditional in `ServiceFormModal.tsx` (no new state or props needed).
- No changes to `ServiceDetailPage.tsx` required because it already hides the card when the fields are null.

Out of scope
- This plan only affects the MS Fleet Fuel Card Instructions service; support contact fields remain available for other services.