
## The short answer: No — you should guard everything. Here's the complete gap analysis and plan.

The question is valid. Right now demo mode is *mostly* covered but has genuine gaps where real data mutations can still fire. There's no architectural reason to leave any staff/management-facing write action unguarded.

### What's already guarded
- `OperatorDetailPanel` — stage saves, notes, cert reminders
- `DocumentEditorModal` — save
- `EquipmentAssignModal` — assign
- `EquipmentReturnModal` — return
- `ICABuilderModal` — save/send/draft
- `StaffDirectory` — invite, role change, delete
- `PipelineConfigEditor` — save
- `StaffPortal` / `ManagementPortal` — bulk message send button

### Confirmed gaps (unguarded write handlers)

**Management Portal components:**
| Component | Unguarded handlers |
|---|---|
| `AdminDocumentList.tsx` | inline toggle (visibility, sort), `handleDelete` |
| `ComplianceDashboard.tsx` | `sendReminder`, bulk reminder send |
| `FaqManager.tsx` | `handleSave`, `handleDelete`, reorder |
| `ResourceLibraryManager.tsx` | `handleSave`, `handleDelete`, reorder |
| `ServiceLibraryManager.tsx` | toggle visibility, toggle essential, mark verified, `handleDelete` |
| `HelpRequestsPanel.tsx` | `handleUpdateStatus` |
| `ServiceFormModal.tsx` | `handleSubmit` |
| `ResourceFormModal.tsx` | `handleSubmit` |

**Staff Portal components:**
| Component | Unguarded handlers |
|---|---|
| `InspectionBinderAdmin.tsx` | upload, `handleDelete`, `handleDeleteStaged`, `saveExpiry`, `updateUploadStatus` |
| `OperatorBinderPanel.tsx` | upload, `handleDelete`, `saveExpiry`, `updateUploadStatus` |
| `ArchivedDriversView.tsx` | `handleReactivate`, `handleEditReason` |
| `AddDriverModal.tsx` | `handleSubmit` |
| `StaffDirectory.tsx` | `handlePhoneUpdate`, `handleNameUpdate`, `handleEmailUpdate`, `handleToggleStatus` (4 handlers still missing guards) |

**Note on operator-facing components:** `OperatorInspectionBinder`, `DocumentViewer` (acknowledge), `ServiceDetailPage` (completions/bookmarks), `DriverServiceLibrary` (view tracking) — these are *operator* portal components, not staff/management, so guarding them is optional. Staff demo mode is about staff practicing, not impersonating operators.

---

### Plan

Add `useDemoMode` + `if (guardDemo()) return;` to every unguarded write handler in the 10 components listed above. The pattern is identical to what's already implemented — no architectural changes needed.

**Files to change:**
1. `src/components/documents/AdminDocumentList.tsx` — guard inline toggle handler + `handleDelete`
2. `src/components/documents/ComplianceDashboard.tsx` — guard `sendReminder` + bulk send
3. `src/components/management/FaqManager.tsx` — guard `handleSave`, `handleDelete`, reorder
4. `src/components/management/ResourceLibraryManager.tsx` — guard `handleSave`, `handleDelete`, reorder
5. `src/components/service-library/ServiceLibraryManager.tsx` — guard all toggle/delete handlers
6. `src/components/service-library/HelpRequestsPanel.tsx` — guard `handleUpdateStatus`
7. `src/components/service-library/ServiceFormModal.tsx` — guard `handleSubmit`
8. `src/components/service-library/ResourceFormModal.tsx` — guard `handleSubmit`
9. `src/components/inspection/InspectionBinderAdmin.tsx` — guard upload, delete, expiry, status update
10. `src/components/inspection/OperatorBinderPanel.tsx` — guard upload, delete, expiry, status update
11. `src/components/drivers/ArchivedDriversView.tsx` — guard reactivate and edit reason
12. `src/components/drivers/AddDriverModal.tsx` — guard `handleSubmit`
13. `src/components/management/StaffDirectory.tsx` — add missing guards to phone, name, email, toggle-status handlers

No new files. No database changes. No prop drilling — every component can call `useDemoMode()` directly as a hook.
