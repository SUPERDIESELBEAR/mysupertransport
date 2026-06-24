## Add "Edit denial reason" button to the drawer header

### What changes
In the Application Review drawer top header (where Print/Close live), when `review_status === 'denied'` and the viewer is Management or Owner, add a small **Edit reason** button.

```text
┌──────────────────────────────────────────────────────────────┐
│ John Smith  · Denied             [Edit reason] [Print] [×]   │
├──────────────────────────────────────────────────────────────┤
│  Overview │ Documents │ PEI                                  │
└──────────────────────────────────────────────────────────────┘
```

### Behavior
- Click → switches `activeTab` to **Overview**, scrolls to the existing red denial card, and opens the inline editor (sets `reasonEditing = true`, prefills `reasonDraft` from current reason body).
- Save / Cancel / audit logging all reuse the existing logic already in the Overview card — no duplicate code paths.
- Button is hidden for staff/dispatch roles (same `canEditDenialReason` gate already defined).
- Button is hidden once `reasonEditing` is true (avoids redundancy while editing).

### Files touched
- `src/components/management/ApplicationReviewDrawer.tsx` — add the header button next to existing header actions; wire its onClick to `setActiveTab('overview')`, `setReasonDraft(bodyText)`, `setReasonEditing(true)`, then `scrollIntoView` on a ref attached to the denial card.

### Out of scope
- No changes to the denied list page itself.
- No permission changes.
- No schema or audit_log changes.

### Verification
1. Open a denied applicant from Management → Applications → Denied.
2. Header shows **Edit reason** button.
3. Click it → drawer jumps to Overview, denial card is in view, textarea is open and prefilled.
4. Save → toast + persisted text + audit_log entry (unchanged from today).
5. Sign in as onboarding_staff → button is hidden.