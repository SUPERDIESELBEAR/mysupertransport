## Plan: Remove Application Errors from Management Dashboard

Agreed — the panel is low-value day-to-day (it's a raw audit_log filter for `application_submit_failed`, and these errors are already captured in the audit log if ever needed for investigation). Removing it cleans up the sidebar.

### Changes

**`src/pages/management/ManagementPortal.tsx`**
1. Remove the sidebar entry `{ label: 'Application Errors', ..., path: 'app-errors' }` (line ~840).
2. Remove the route/section that renders `<ApplicationErrorsPanel />` (line ~1746).
3. Remove the `import ApplicationErrorsPanel from '@/components/management/ApplicationErrorsPanel'` (line 19).
4. Leave the `AlertTriangle` lucide import in place if other entries still use it; remove only if unused after the deletion.

**`src/components/management/ApplicationErrorsPanel.tsx`**
- Delete the file (no other code references it).

### Out of scope
- No DB changes. The `application_submit_failed` audit_log rows remain — only the UI surface is removed. They can still be queried directly if needed.
- No changes to public `/apply` error capture logic.
