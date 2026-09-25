# Alvys milestone 2, pass 3

## Goal
Make invoice readiness depend on one shared paperwork rule, give invoices SUPERDRIVE branding controls, and provide secure on-demand packet previews without saving them.

## Work
1. **Shared paperwork rule**
   - Update the driver/dispatch rule so either BOL or POD completes signed delivery paperwork while the missing counterpart remains expected.
   - Add one company-scoped database function that returns invoice-readiness missing items, including rate confirmation, conditional lumper receipt, per-ton scale ticket, broker billing address, and approved exceptions.
   - Enforce it from both status advancement and invoice creation, with identical plain-language missing-item messages.
   - Show the database result in the Billing queue and status refusal.

2. **SUPERDRIVE invoice branding**
   - Extend billing settings with a private logo, accent color, footer note, and four optional-field switches.
   - Add secure same-company logo upload/read/remove policies and the matching settings controls.
   - Redesign newly rendered invoices around SUPERDRIVE’s own visual hierarchy while retaining every required billing field and preserving old saved PDFs.
   - Add a dry-run invoice preview using the most recent invoice.

3. **Combined packet preview**
   - Add per-document include switches to the default factor settings.
   - Build a signed-in, company-scoped packet function that places the invoice first, orders documents by packet settings, merges readable PDFs and images, and refuses unreadable files by name.
   - Add Preview packet controls to load details and the Billing queue; previews remain unsaved.

4. **Proof and records**
   - Run rollback-only database proofs for every paperwork case and exact residue counts.
   - Run live dry runs and refusal checks, record packet page maps/sizes, and capture report images.
   - Add database, unit, component, and function tests; run the full suite in bounded parts plus type checking.
   - Record P73–P77 verbatim, update the roadmap and wish list, and write the timestamped pass report with only files changed in this pass.

## Technical notes
- Existing tables and permission patterns remain authoritative; no real invoice or load rows are changed.
- New storage is private, company-scoped, and role-restricted.
- Saved invoice PDFs remain immutable; branding affects only new renders and dry-run previews.
- Late accessorial invoices and payout-question workflows are decisions recorded now, not built in this pass.
