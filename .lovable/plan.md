

## Improve Decal-Applied Notification

### Problem
When staff marks `decal_applied = 'yes'`, the operator receives a generic notification: *"Decal applied to your truck ✓"* / *"Your company decal has been applied to your truck."* It does not mention the required photo uploads and does not link to the correct tab.

### Changes

**1. Update the database trigger `notify_operator_on_status_change`**

Modify the `decal_applied` section to:
- Change the title to: **"Decal applied — upload photos"**
- Change the body to: **"Your company decal has been applied. Please upload driver-side and passenger-side photos of the installed decal from your Documents tab."**
- Add a deep-link: `/operator?tab=documents` (so the operator lands directly on the upload section)
- Add an email notification via the existing `notify-onboarding-update` edge function with milestone key `decal_photos_requested`

**2. Update the `notify-onboarding-update` edge function**

Add a `decal_photos_requested` milestone handler that sends a branded email telling the operator to upload their decal installation photos, with a CTA linking to their portal documents tab.

### Files Modified
| File | Change |
|------|--------|
| Database migration | Update trigger function for decal_applied notification text, link, and email dispatch |
| `supabase/functions/notify-onboarding-update/index.ts` | Add `decal_photos_requested` milestone email template |

