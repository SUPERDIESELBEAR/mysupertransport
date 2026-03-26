
## Management Portal PDF Viewer Audit — Result: No Action Needed

The Management Portal does not contain any unique PDF viewers. Here is why:

**How the Management Portal renders documents:**

The portal itself (`ManagementPortal.tsx`) is a shell that switches between shared components based on the active nav item. Every document-viewing feature in it is served by the same components already audited:

| Management Portal nav item | Component rendered | Status after fixes |
|---|---|---|
| Operator Detail (click any operator row) | `OperatorDetailPanel.tsx` | Fixed — now uses `FilePreviewModal` |
| Document Hub | `DocumentHub.tsx` → `DocumentViewer.tsx` | Fixed — now uses `FilePreviewModal` |
| Inspection Binder | `InspectionBinderAdmin.tsx` | Already correct |
| Service Library | `ServiceLibraryManager.tsx` → `ResourceViewer.tsx` | Fixed — now uses `FilePreviewModal` |

**The one iframe in Management-only code (`EmailCatalog.tsx`):**
Uses `srcDoc={html string}` — this renders inline HTML content directly, not a Supabase storage URL. `X-Frame-Options` only applies to external URLs, so this iframe is unaffected and works correctly.

**Conclusion:** The three fixes applied in the last pass (OperatorDetailPanel, DocumentViewer, ResourceViewer) cover every document-viewing surface accessible from the Management Portal. No additional changes are needed.
