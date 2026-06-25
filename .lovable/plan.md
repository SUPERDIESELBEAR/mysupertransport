## Updated plan: fix Stage 1/2 mismatch after refresh/login

### What your note means
Because logging out/in and using the in-app refresh still does not update the driver portal, this is likely not just a missed realtime event. A fresh login should re-fetch the database. So the higher-risk issue is one of these:

- Management is marking Stage 1/2 complete using one set of fields, while the driver portal calculates progress from different fields.
- The management UI shows a stage as complete before the related `onboarding_status` fields are actually saved.
- The driver portal fetch is reading the right row but its stage-completion logic is stricter/different than management.
- Realtime can still help, but it will not fix a mismatch if the fetched values themselves do not satisfy the driver portal logic.

### Implementation steps

1. **Align Stage 1 completion rules**
   - In `src/pages/operator/OperatorPortal.tsx`, make the driver portal calculate Stage 1 complete the same way management does:
     - `mvr_ch_approval === 'approved'`
     - `pe_screening_result === 'clear'`
   - Keep denied/non-clear states as action-required.
   - Make the Stage 1 substep labels reflect the same fields management uses so the driver sees why it is or is not complete.

2. **Align Stage 2 completion rules**
   - Confirm the driver portal uses the same four required document fields management uses:
     - `form_2290 === 'received'`
     - `truck_title === 'received'`
     - `truck_photos === 'received'`
     - `truck_inspection === 'received'`
   - If management has any alternate “received/approved” values or shortcut buttons, normalize the driver-side logic so those saved values also count correctly.

3. **Make refresh/login catch up from the source of truth**
   - Keep `fetchData()` as the source-of-truth reload for the driver portal.
   - Add a catch-up refresh when the app returns to foreground, regains focus, or comes back online.
   - This ensures phone/browser background behavior does not leave the portal stale after management changes.

4. **Harden Realtime as a fast path, not the only path**
   - Keep the existing Realtime subscription for `onboarding_status` and `operator_documents`.
   - When the subscription connects, immediately call `fetchData()` so any already-saved management changes appear.
   - On status/document changes, update local state immediately and reconcile with `fetchData()` afterward.

5. **Add a small driver-visible “last updated” signal**
   - On the status page, show a subtle “Updated just now / Updated X min ago” indicator tied to the last successful portal refresh.
   - This helps confirm whether the phone has actually pulled fresh data after management saves changes.

### Verification
- Test with a driver whose management Stage 1 and Stage 2 are marked complete.
- Open the driver portal fresh and confirm Stage 1 and Stage 2 show complete without needing any realtime event.
- Change a Stage 2 document status in management and confirm the driver portal updates automatically or immediately after app focus/refresh.
- Confirm Stage 3 becomes the current/next available stage once Stage 1 and Stage 2 are complete.