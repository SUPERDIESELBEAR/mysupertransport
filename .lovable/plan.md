
## QPassport Uploaded — Operator Notification

### What this adds

When a coordinator uploads a QPassport PDF in the staff portal, the operator receives:
- **In-app notification** (bell icon): "📋 Your QPassport is Ready" — with a link to their Stage 1 checklist
- **Email** (respecting operator's `onboarding_update` preference): branded email telling them to download the QPassport before going to the testing facility

---

### Files to Change

**1. `src/pages/staff/OperatorDetailPanel.tsx`**

After the `onboarding_status` update succeeds in `QPassportUploader.handleFile` (line ~175), call `send-notification`:

```ts
await supabase.functions.invoke('send-notification', {
  body: { type: 'qpassport_uploaded', operator_id: operatorId },
});
```
This is fire-and-forget (wrapped in try/catch, non-blocking) — same pattern as the receipt upload in `PEScreeningTimeline`.

**2. `supabase/functions/send-notification/index.ts`**

Add a new `case 'qpassport_uploaded'` before the `default` case. It will:

- Look up the operator's `user_id` and `application_id` to resolve their name
- Look up the operator's `user_id` to get their auth email
- **In-app**: insert a notification for the operator's `user_id`:
  - title: `"📋 Your QPassport is Ready"`
  - body: `"Your QPassport has been uploaded by your coordinator. Download it and bring it to your drug screening appointment."`
  - link: `"/operator"` (where the Stage 1 card lives)
  - Respect operator's `onboarding_update` in-app preference (default: enabled)
- **Email**: send to operator's email address using `buildEmail` + `sendEmail`:
  - subject: `"Action Required: Download Your QPassport"`
  - heading: `"📋 Your QPassport is Ready"`
  - body: explains they need to download and bring it to the facility, with a CTA button linking to their portal
  - Respect operator's `onboarding_update` email preference (default: enabled)

No migration needed. No new tables. No new edge function needed.

---

### Technical Details

- The `NotificationPayload` type at the top of `send-notification/index.ts` needs `'qpassport_uploaded'` added to the `type` union.
- Uses the existing `getOperatorEmail` and `userEmailEnabled` / `userInAppEnabled` helpers — no new code needed there.
- The notification flow exactly mirrors the existing `dispatch_status_change` operator notification pattern.
- After changing `send-notification`, the edge function must be redeployed.
