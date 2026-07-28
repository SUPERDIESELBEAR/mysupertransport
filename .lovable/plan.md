## Problem
The driver app currently has two top-level menu items that read almost identically:

- **Documents** (icon: Upload) — opens the **Document Uploads** page where the driver uploads onboarding documents (Form 2290, truck title, truck photos, etc.).
- **My Documents** (icon: FolderOpen) — opens the read-only file vault where the driver can view previously uploaded/assigned documents organized by type (Truck Photos, ICA Summary, Signed Assignment Sheets, Equipment Return receipts, etc.).

Because both labels start with "Documents," drivers tap the wrong one and are unsure which page holds what.

## Recommended change
Rename the **action-oriented** page, not the vault. The vault name "My Documents" is already accurate and widely understood. The upload page is the one whose label is too generic.

| Current | Proposed | Rationale |
|---|---|---|
| Menu: **Documents** | Menu: **Upload Documents** (short: **Upload Docs**) | The word "Upload" immediately signals this is where you *put* documents, not where you *find* them. It also matches the existing page title "Document Uploads". |
| Menu: **My Documents** | Keep as-is | This is the personal file cabinet. The "My" prefix clearly distinguishes it from the company/Doc Hub. |
| Page title: **Document Uploads** | Keep as-is, or align to **Upload Documents** | Either works; keeping the current title is fine since the menu now uses the same verb. |

### Alternative options if you prefer a different direction
1. **Rename the vault instead**: keep **Documents** for the upload page, change **My Documents** → **My Files** / **File Vault** / **Driver Vault**. This is less intuitive for drivers looking for their onboarding paperwork.
2. **Rename both**: **Upload Center** + **My Files**. Cleanest pair, but "My Files" loses the "documents" association.
3. **Use onboarding context**: **Onboarding Documents** + **My Documents**. Accurate, but the menu item becomes long and stops making sense once the driver is fully onboarded.

My recommendation is **Option 1** (rename the upload menu item to "Upload Documents" / "Upload Docs").

## Implementation scope
- Update `src/pages/operator/OperatorPortal.tsx`:
  - Change the hamburger menu item label from `Documents` to `Upload Documents` and add a short label `Upload Docs`.
  - Optional: adjust the page title to match if desired.
- No route changes, no backend changes, no icon changes needed (the Upload icon already fits).
- Optionally update the `Document Uploads` heading inside `src/components/operator/OperatorDocumentUpload.tsx` to match the new menu label.

## Verification
- Open the driver portal on mobile width.
- Confirm the hamburger menu now shows: **Upload Documents**, **My Documents**.
- Tap each and confirm the destination matches the label.
- Confirm no other references in the codebase still use the old label.
