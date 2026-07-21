## 1. Rename "Authorization #1" → "Passenger Authorization"

Update copy in the driver-facing surfaces where the phrase appears:

- `supabase/functions/_shared/transactional-email-templates/passenger-auth-request.tsx`
  - Body paragraph: "…please tap the button below to complete **Passenger Authorization** and sign the form."
  - Keep subject line as "Action needed: Passenger Authorization for Unit {unit}" (already correct).
- `supabase/functions/send-passenger-auth/index.ts`
  - Notification body: "Complete the Passenger Authorization for Unit {unit_number} and sign the form."
- `src/components/management/SendPassengerAuthModal.tsx`
  - Helper copy: "…email link to complete the Passenger Authorization and sign the form."
- `src/components/operator/PendingPassengerAuthCard.tsx`
  - Any "Authorization #1" wording → "Passenger Authorization".
- `src/pages/PassengerAuthSign.tsx`
  - Replace any "Authorization #1" section headings/labels with "Passenger Authorization" (the actual form field labels — Passenger Name, Relationship, DOB, Effective Date, Signature — stay as-is).

No wording changes on the staff modal title or the doc PDF footer beyond the phrase swap.

## 2. Fix the missing in-app notification

The email arrived but the in-app card/bell did not, which means the `notifications` insert inside `send-passenger-auth` either didn't run in the deployed version or failed silently.

Steps:

1. **Redeploy `send-passenger-auth`** — the previous deploy predates the notification-insert code path, so the running function may still be the email-only version.
2. **Add loud logging + surface errors** in `send-passenger-auth`:
   - Log `operatorId`, resolved `user_id`, and the result of the `notifications` insert.
   - If the insert returns an error, log it (don't fail the whole request — email should still send).
3. **Verify the insert shape** against the live schema:
   - `type: 'assignment'`, `channel: 'in_app'`, `priority: 'high'`, `title`, `body`, `link`, `entity_type: 'passenger_authorization'`, `entity_id`, `user_id`.
   - Confirm `notification_channel` enum includes `in_app` and `type` accepts `'assignment'` (both are used elsewhere in the app, so this should be fine — logs will confirm).
4. **Sanity-check `PendingPassengerAuthCard` + bell query filters** so the row actually surfaces:
   - Card queries `passenger_authorizations` where `operator_id = me` and `status IN ('sent','opened')`.
   - Bell reads `notifications` where `user_id = me` and not archived.
   - Confirm the newly inserted row matches both filters for Marcus's `auth.uid()`.
5. Re-test by clicking **Send to driver** for Marcus and confirming:
   - A row appears in `notifications` for his `user_id`.
   - The bell shows "Passenger Authorization required".
   - The Home dashboard shows the Pending Passenger Auth card.
   - Edge function logs show the insert succeeded.

## Files touched

- `supabase/functions/_shared/transactional-email-templates/passenger-auth-request.tsx` (copy)
- `supabase/functions/send-passenger-auth/index.ts` (copy + logging + redeploy)
- `src/components/management/SendPassengerAuthModal.tsx` (copy)
- `src/components/operator/PendingPassengerAuthCard.tsx` (copy)
- `src/pages/PassengerAuthSign.tsx` (copy)

## Out of scope

- No schema changes.
- No changes to signing flow, PDF generation, or filing behavior.
