# Branded email for selected documents in binder list view

## Problem
In the binder **list view**, selecting documents and tapping **Email** opens the phone's mail app with a raw plain-text blob of long URLs (the screenshot). The **flipbook** view already sends a branded SUPERTRANSPORT HTML email through the backend, with per-document View buttons and a "View all documents" binder link.

## What changes
The list view's **Email** action gets the same experience as the flipbook:

1. Tapping **Email** opens the same in-app dialog: recipient address, optional note, "Send email" gold button.
2. On send, the recipient gets the branded HTML email — driver name, unit, numbered document rows with gold **View** buttons, and (for 2+ documents) the **"View all N documents"** flipbook link.
3. Same feedback: "Sending…" -> green **"Sent"** confirmation -> dialog closes and clears the selection.
4. Same fallback: "Use my mail app instead" keeps the current mail-app behavior for offline/no-signal.
5. The **Text** button is unchanged.

## Technical scope
- Extract the flipbook's email dialog and send logic into a shared component, `src/components/inspection/BinderEmailShareDialog.tsx` (props: open, docs `{token, url, title}[]`, driverName, unitNumber, onSent/onClose). Logic moves as-is: `send-binder-share` invoke, 45s timeout, inline error, `emailSent` state and 2s auto-close.
- `src/components/inspection/BinderFlipbook.tsx`: replace its inline dialog with the shared component; behavior identical.
- `src/components/inspection/OperatorInspectionBinder.tsx`: `bulkShareEmail` opens the shared dialog with the selected docs (mapped to their `public_share_token`) instead of building a raw mail-app link; clear selection after a successful send.
- No backend changes — `send-binder-share` and the email template already handle multi-document sends and bundle links.