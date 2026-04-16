

## Rename Sidebar Label to "Dispatch Board"

The sidebar item that navigates to the Dispatch portal is defined in **`ManagementPortal.tsx`** (line 689), not in `DispatchPortal.tsx`. The previous edit only changed the internal nav and page title — the Management Portal sidebar still shows "Dispatch".

### Change

| File | Line | From | To |
|------|------|------|----|
| `src/pages/management/ManagementPortal.tsx` | 689 | `label: 'Dispatch'` | `label: 'Dispatch Board'` |

Single-line edit. No database changes.

