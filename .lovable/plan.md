# Fix: Overview tab unreadable after a correction is approved

## What the staff is seeing (confirmed)

In the Application Review drawer, the layout below the tab bar looks like this:

```text
┌─ Header (fixed) ───────────────────────────┐
├─ Tabs: Overview | Documents | PEI (fixed) ─┤
├─ Scrollable content (Overview body) ───────┤   ← flex-1, should grow
├─ Correction Request Status card (fixed) ───┤   ← grows after corrections
├─ Revision history banner + audit log (fx) ─┤   ← grows a lot after corrections
└─ Action footer (fixed) ────────────────────┘
```

The correction status card and revision-history banner are siblings of the scroll region with `shrink-0`. Once a correction cycle has run, they contain the full request history, reviewer notes, reply attachments, and the revision audit log — often several hundred pixels tall. They consume all the available vertical space, so the Overview scroll area collapses to near-zero height. Personal Info, Address, CDL Info, etc. are still in the DOM but staff cannot scroll down to reach them.

The Print / Save-as-PDF button on this drawer prints `#app-review-print-content`, which is only the (now-collapsed) Overview body — so the CDL number, medical card, and other fields don't appear in the exported PDF either.

## Fix

Restructure the drawer so post-correction history lives **inside** the Overview scroll region instead of stealing space from it, and make sure the printable/downloadable view always contains the full application data.

### 1. Move history-driven sections into the scrollable overview

In `src/components/management/ApplicationReviewDrawer.tsx`:

- Keep only the header, tabs, and action footer as fixed (`shrink-0`) siblings of the scroll container.
- Move these blocks **inside** the `#app-review-print-content` scroll region (rendered under the Overview tab, at the top, before Personal Info):
  - `RevertedBanner`
  - `CorrectionRequestStatusCard`
  - The `revision_requested_at` banner (with `RevisionReplyAttachments` and `RevisionAuditLog`)
- Keep the action footer (`Reviewer Notes`, Approve / Deny / Send back buttons) as a fixed bottom bar so staff can always act without scrolling.
- Result: no matter how much correction history accumulates, the Overview scroll region keeps its full height and staff can always scroll down to Personal Info → CDL Info → etc.

### 2. Make sure Documents and PEI tabs also get the full height back

Because the correction/revision blocks currently render regardless of active tab, they also shrink Documents and PEI. Moving them into the Overview tab body fixes those tabs automatically. If we still want the correction summary visible on Documents/PEI, render a lightweight collapsed pill in the header row instead of the full card.

### 3. Ensure Print / Download includes CDL and medical card

- Confirm `#app-review-print-content` wraps the complete Overview (Personal, Address, CDL, Employment, Driving, Documents summary, Signature) after the restructure, so `handlePrint` produces a PDF containing the CDL number and medical-card expiration date.
- In the Overview "Documents" section, render the medical certificate and DL front/rear as inline `<img>` thumbnails (using the same `preloadSignatureDataUrl` pattern already used for signatures) so the printed PDF includes the actual images, not just "View" buttons. Buttons stay for on-screen use; images render behind them and are visible in print via a `print:block hidden` / `hidden print:block` pair.

### Files touched

- `src/components/management/ApplicationReviewDrawer.tsx` — restructure JSX; no behavioral changes to approve/deny/revert flows.
- (Optional) `src/components/management/SubmittedApplicationSnapshot.tsx` — no change needed; already prints CDL + medical card via its own "Print application" button.

### Out of scope

- No database, RLS, or edge-function changes.
- No changes to the correction/revision workflow itself — only where those components render inside the drawer.
