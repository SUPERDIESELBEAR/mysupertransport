# Notification CTA — single "View" button that opens the attached item inline

## What changes (visible)

1. The contextual labels ("View Onboarding", "Open Background Check", "View Documents", etc.) on the expanded notification CTA are all replaced with a single label: **View**.
2. When a notification has an actual attached file (today, that's the **"Your QPassport is Ready"** notification), tapping **View** opens the file directly inside a preview modal on the notifications page — no navigation away. The user can read and download the PDF right there.
3. Notifications that don't carry an attachment (e.g. "Application Approved", "New Message", dispatch updates) keep behaving as deep-links: tapping **View** still takes the user to the relevant page, just under the new "View" label.
4. If a notification has neither an attachment nor a `link`, the **View** button is hidden (today it's already hidden when `link` is null).

## How it works (technical)

File: `src/components/management/NotificationHistory.tsx`

- Replace the `CTA_LABEL` map with a single constant label `'View'` used for every type.
- Add a small `attachmentResolvers` map keyed by `notification.type`. Each entry is an async function `(userId) => { url, name } | null` that fetches the file URL for the current user. Initial entries:
  - `qpassport_uploaded` → `select qpassport_url from onboarding_status where user_id = :userId` → `{ url, name: 'QPassport.pdf' }`.
  - (Map is structured so future file-bearing notification types — e.g. signed ICA, pay statements — can be added with one line.)
- New state: `previewFile: { url: string; name: string } | null`.
- New `handleView(n)` click handler (replaces the inline `navigate(n.link!)` in both the desktop and mobile expanded rows):
  1. If `attachmentResolvers[n.type]` exists → call it; on success, set `previewFile` and stop. On null/failure, fall back to `navigate(n.link)` if present, otherwise show a toast "File no longer available".
  2. Else if `n.link` → `navigate(n.link)`.
- Render `FilePreviewModal` (imported from `@/components/inspection/DocRow`, already used elsewhere for PDFs/images) at the bottom of the component when `previewFile` is set, with `onClose={() => setPreviewFile(null)}`.
- The **View** button is shown whenever `n.link` exists OR `attachmentResolvers[n.type]` exists.

## Out of scope

- No changes to the email CTA wording or to the `send-notification` edge function — only the in-app notification list is affected.
- No schema changes. We resolve the QPassport URL on click from `onboarding_status`, the same source the Background Check timeline uses.
- No changes to message attachments inside the messaging thread (separate component).
