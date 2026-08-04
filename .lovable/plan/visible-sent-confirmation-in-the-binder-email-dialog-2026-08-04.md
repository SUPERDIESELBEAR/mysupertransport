# Visible "Sent" confirmation in the binder email dialog

## Problem
The send works, but the only confirmation is a toast rendered behind the full-screen flipbook. The button flips from "Send email" back to "Send email", so it looks like nothing happened.

## What changes
In the binder email dialog, add a short-lived success state:

1. On a successful send, the gold button becomes a green **"Sent"** button with a checkmark and stays disabled.
2. A green inline confirmation appears in the dialog body: "Sent to name@example.com — 3 documents." (mirrors the existing red inline error styling).
3. The dialog stays open for about 2 seconds so the confirmation is readable, then closes automatically and clears the selection, exactly as today.
4. State resets when the dialog is reopened, so a new send starts clean.
5. The existing toast stays for staff views where the dialog isn't behind an overlay.

Button states: `Send email` -> `Sending…` (spinner) -> `Sent` (green check) -> dialog closes.

No changes to the email itself, the backend function, document selection, or the "Use my mail app instead" fallback.

## Technical scope
- `src/components/inspection/BinderFlipbook.tsx`: add an `emailSent` state alongside `emailSending`/`emailError`; set it in the success branch of `sendEmailShare`, delay `setEmailOpen(false)` via a cleaned-up timer, clear it in `openEmailShare` and on dialog close.