

## Fix "Mark All Read" Not Clearing Sidebar Badges

### Problem
Three separate issues contribute to the red dots persisting:

1. **Notifications badge** — The "Mark all read" button in `NotificationHistory` only marks the currently loaded page of notifications (up to 25). If there are more unread notifications beyond the first page, the sidebar badge persists because the re-fetched count is still > 0. The fix is to mark **all** unread notifications in the database, not just the loaded ones.

2. **Applicant Pipeline & Compliance badges** — These red dots show `criticalExpiryCount` (expiring CDLs and Medical Certificates within 30 days). They are **not** notification-based — they represent real compliance alerts. "Mark all read" does not and should not affect them. These badges will only disappear when the underlying expiry dates are updated or the documents are renewed. No code change needed here, but this may warrant a brief clarification.

### Changes

**`src/components/management/NotificationHistory.tsx`**

Update `markAllRead` to mark **all** unread notifications for the user in one query, not just the loaded page:

```typescript
const markAllRead = async () => {
  if (!session?.user?.id) return;
  setMarkingAll(true);
  // Mark ALL unread notifications, not just the loaded page
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .is('read_at', null);
  // Update local state
  setNotifications(prev =>
    prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
  );
  setMarkingAll(false);
};
```

This ensures the sidebar badge drops to 0 because the realtime subscription in `ManagementPortal` re-fetches the true unread count (which will now be 0).

**Same fix in `src/pages/staff/StaffPortal.tsx`** — The Staff Portal's notification realtime subscription only listens for `INSERT` events, so it never decrements the badge when notifications are marked as read. Update it to listen for all events (`event: '*'`) and re-fetch the actual count (matching the Management Portal pattern).

### Files
| File | Change |
|------|--------|
| `src/components/management/NotificationHistory.tsx` | Mark all unread notifications for the user, not just loaded page |
| `src/pages/staff/StaffPortal.tsx` | Change notification realtime subscription from INSERT-only to `*` with re-fetch |

### Note on Pipeline & Compliance badges
The red dots on Applicant Pipeline and Compliance represent **real expiring documents** (CDL or Medical Certificate expiring within 30 days). These are intentional safety indicators and are separate from the notification system. They clear automatically when the operator's certifications are renewed.

