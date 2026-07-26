## Goal

In the driver app's **My Documents** page, replace the current flat list + separate cards with a single set of **document-type folders**, all collapsed by default. Each folder shows its name and a count; tapping expands it. New documents automatically drop into the matching folder, and an unmatched document type creates a new folder on the fly.

## What the driver sees

```text
My Documents
  ▸ Passenger Authorization        (2)
  ▸ IRS Form 2290                  (1)
  ▸ Truck Title                    (1)
  ▸ Truck Photos                   (4)
  ▸ Signed Assignment Sheets       (3)
  ▸ Equipment Return Receipts      (1)
  ▸ Receipts                       (2)
  ▸ Other                          (1)
```

- All folders start collapsed; expanding one keeps the others closed state untouched (no accordion lock).
- Empty folders are hidden entirely.
- Folder order: known types first in a fixed sensible order, then any auto-created types alphabetically, with **Other** always last.
- Inside a folder, rows keep today's behavior: file name, upload date, expiry badge, view/download actions, in-app preview modal.
- If an action is pending (e.g. a return receipt still needed), that folder gets a small "Action needed" badge so it isn't buried while collapsed.

## Folder naming rules

1. A vault document's `category` maps to its known display name (IRS Form 2290, Truck Photos, Truck Title, Receipt, Passenger Authorization).
2. If the category is unknown/`other` but the document has a meaningful `label`, that label becomes the folder name — so a new doc type creates its own folder automatically.
3. Anything with no usable label falls into **Other**.
4. Non-vault items are folded in as their own fixed folders: **Signed Assignment Sheets** and **Equipment Return**.

## Technical notes

- New presentational component `src/components/operator/MyDocumentsFolders.tsx` that:
  - loads vault docs (same query/signed-URL logic as `DriverVaultCard`, read-only path),
  - accepts the assignment-sheet and equipment-return content as additional folder entries,
  - derives folder groups from a small pure helper (`groupDocumentsByType`) so naming rules are unit-testable.
- `src/pages/operator/OperatorPortal.tsx` (`view === 'my-docs'` block) renders the new folder list instead of the three stacked cards. `EquipmentReturnCard` and `SignedAssignmentSheetsCard` are reused unchanged as folder bodies, with their own internal card chrome/collapse suppressed via a prop so we don't get a collapse-inside-a-collapse.
- `DriverVaultCard` stays as-is for the management side; only the driver-facing read-only usage changes.
- No database or schema changes required — grouping is derived from existing `driver_vault_documents.category` / `label`.
