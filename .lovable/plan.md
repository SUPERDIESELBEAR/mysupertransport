## Goal
Eliminate the lag between staff marking Stage 2 docs as "received" on the management dashboard and what the driver sees in the operator portal. Today, the operator portal only re-fetches `onboarding_status` and `operator_documents` on mount / view changes, so updates appear only after a manual refresh or tab change. We'll make those updates push live via Supabase Realtime.

## Changes

### 1. Enable Realtime on the two tables that drive Stage 2 status
A small migration to add them to the `supabase_realtime` publication and ensure `REPLICA IDENTITY FULL` so UPDATE payloads include the full row:

```sql
ALTER TABLE public.onboarding_status REPLICA IDENTITY FULL;
ALTER TABLE public.operator_documents REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_documents;
```
(Wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object ...` so re-runs are safe.)

### 2. Subscribe the operator portal to live changes
In `src/pages/operator/OperatorPortal.tsx`, add a new `useEffect` (next to the existing dispatch/messages/notifications channels) that:

- Subscribes to `postgres_changes` on `onboarding_status` filtered by `operator_id=eq.${operatorId}` (covers all status fields: `form_2290`, `truck_title`, `truck_photos`, `truck_inspection`, MVR/CH, PE, etc.). On any event, merge `payload.new` into `onboardingStatus` state so Stage 2's "received / requested / awaiting review" badges flip instantly.
- Subscribes to `postgres_changes` on `operator_documents` filtered by `operator_id=eq.${operatorId}` for INSERT/UPDATE/DELETE so uploaded-doc lists and Stage 2 chips update without a refresh.
- Tears down both channels on unmount (`supabase.removeChannel`).
- Guarded by `if (isPreview || !operatorId) return;` to match the existing pattern and avoid leaks in management's "Preview as operator" mode.

State updates use functional setters so we don't have to add deps that re-subscribe.

### 3. Light safety net (no polling)
Keep the existing `fetchData()` call paths (initial load, tab change, post-upload). Realtime is the primary path; the existing fetches remain as a fallback on view switch.

## Out of scope
- No changes to the management dashboard write path — staff updates already hit `onboarding_status`/`operator_documents`, which is exactly what Realtime is listening to.
- No changes to stage-completion logic, just to how fast the UI sees fresh data.

## Verification
1. As a driver in the portal, sit on the Status page with Stage 2 expanded.
2. From the management dashboard, flip a Stage 2 doc (e.g. `truck_inspection`) to "received".
3. The driver's Stage 2 row should update from "Requested / Awaiting Review" to "Received" within ~1s with no refresh, and Stage 2 should auto-complete once all four are received.
