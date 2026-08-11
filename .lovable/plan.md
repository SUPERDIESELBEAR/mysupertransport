# Fix: MVR / Clearinghouse reset to "Not Started" after Approve & Invite

## What actually happened

The dropdowns in Background Verification are only local screen state until the small **Save** button in that section is clicked. The **Approve & Invite** button, however, unlocks off that same unsaved screen state.

So the staff member set both to Received, the Approve button lit up, they approved — but nothing was ever written to the application record.

Confirmed in the data for Emma Mueller:
- Application: approved at 14:42 today, but MVR status and Clearinghouse status are both stored as "not started".
- The onboarding record created one second later copied those same "not started" values, with MVR/CH approval left pending.

This is not a display bug — the received statuses were never saved, and the approval gate meant to prevent exactly this was reading unsaved values.

## The fix

1. Approve & Invite only unlocks on saved values. The gate reads the stored application record, not the on-screen dropdowns. With unsaved changes in Background Verification, the button stays disabled with a clear hint: "Save background verification first."
2. Auto-save before approving. If staff hit Approve with the dropdowns set to Received but unsaved, save that section first, then continue into approval — so the normal flow just works instead of silently dropping values.
3. Keep the panel in sync. The Background Verification fields currently seed once and can hold stale values when a different applicant loads; they will re-sync whenever the loaded application changes, so a reopened approved applicant always shows what is stored.
4. Data repair for Emma Mueller. Set her application and her onboarding record to MVR = Received, Clearinghouse = Received, and MVR/Clearinghouse approval = Approved, matching what staff intended at approval time.
5. Check for other affected drivers. Find anyone else approved while MVR/CH were still "not started" and list them for your confirmation before correcting.

## Technical notes

- `src/components/management/ApplicationReviewDrawer.tsx`: `bgVerificationComplete` is derived from `bgMvrStatus`/`bgChStatus` local state (~lines 400-407) and drives `disabled` on the approve button (~1484). Derive it from `app.mvr_status`/`app.ch_status` plus a `!bgIsDirty` requirement; have the approve handler call `saveBgVerification()` first when dirty; add a `useEffect` on `app?.id` to reseed `bgMvrStatus`/`bgChStatus`/`bgNotes`.
- `supabase/functions/invite-operator/index.ts` (~lines 203-206) copies application statuses into `onboarding_status` — no change needed once source values are correct.
- Data repair is a data update on `applications` and `onboarding_status`, not a schema migration.