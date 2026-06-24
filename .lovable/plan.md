## Persist denial-reason edits to the list and re-opened drawer

The previous attempt was never actually wired up — the drawer still has no callback to the parent, so `ManagementPortal`'s `applications` list and `selectedApp` keep showing the old `reviewer_notes` after Save. That's why the red preview under the driver's name doesn't change and reopening the card shows stale text.

### Changes

**`src/components/management/ApplicationReviewDrawer.tsx`**
- Add optional prop `onApplicationUpdated?: (patch: Partial<FullApplication> & { id: string }) => void`.
- In the denial-reason `saveEdit` success path (right after `setReasonOverride(nextValue)`), call `onApplicationUpdated?.({ id: app.id, reviewer_notes: nextValue })`.

**`src/pages/management/ManagementPortal.tsx`**
- Pass `onApplicationUpdated` to `<ApplicationReviewDrawer>`:
  - Update `selectedApp` with the patch (so reopening shows the new value without a refetch).
  - Update the matching row in the `applications` state array (so the red preview text under the driver's name reflects the new reason immediately).

### Why this fixes both symptoms
- Preview under driver's name reads from `applications[].reviewer_notes`; updating that array updates the list row.
- Reopening the drawer reads from `selectedApp`; updating it ensures the red card shows the new reason instead of the stale DB-load value.

### Out of scope
- No DB schema, RLS, audit-log, or permission changes.
- No changes to the realtime subscription (we update locally so the user sees the change instantly regardless of realtime latency).

### Verification
1. Open a denied applicant → Edit reason → Save → toast "Reason updated."
2. Close drawer → red preview text under the driver's name on the Denied tab reflects the new reason.
3. Reopen the same driver → red "Application denied" card shows the new reason (no stale value).
4. Hard reload the page → value still persisted from DB.
