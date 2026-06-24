## Remove header "Edit reason" button

Revert the header shortcut. Keep the Edit control only inside the red "Application denied" card on the Overview tab (where it lived before today's header change).

### Changes
- `src/components/management/ApplicationReviewDrawer.tsx`
  - Remove the `Edit reason` button from the drawer header (the block added next to Print/Close).
  - Remove the now-unused `openDenialReasonEditor` helper and the `denialCardRef` ref + its attachment on the denial card div.
  - Leave the inline Edit/Save/Cancel flow inside the red denial card untouched.

### Out of scope
- No changes to permissions, audit logging, or save behavior.

### Verification
1. Open a denied applicant → header shows only Print and Close (no Edit reason).
2. Overview tab still shows the red denial card with its Edit button for Management/Owner.
3. Edit → Save still works and writes the audit_log entry.