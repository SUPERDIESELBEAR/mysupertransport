
## Goal

Every management page header shows the same lucide icon that appears next to its label in the sidebar, positioned to the immediate left of the H1 title. Sidebar and header stay in visual lockstep.

## Approach

Single source of truth: the icon list already lives on `navItems` in `src/pages/management/ManagementPortal.tsx`. I'll:

1. Extract each nav entry's icon into a shared map keyed by the view path (e.g. `'overview' → LayoutDashboard`, `'pipeline' → Users`, `'compliance' → ShieldCheck`, etc.). Kept in a small new file `src/pages/management/navIcons.tsx` so both the sidebar and page headers import from the same place.
2. Update `navItems` to reference this map (no visual change to the sidebar).
3. Add the icon to the left of each page H1. Icon size: `h-6 w-6` on desktop, `h-5 w-5` on mobile, colored `text-primary` (gold) to match the active-nav accent. Wrap title + icon in a `flex items-center gap-2` row.

## Header locations to update

Headers rendered directly in `ManagementPortal.tsx` (inline in the switch/route block): Management Overview, Applications, Messages, What's New, plus any others currently declared there.

Headers owned by child page components — one edit each to prepend the icon:
- `PipelineDashboard.tsx` → Onboarding Pipeline
- `NotificationHistory.tsx` → Notifications
- `EmailLogPanel.tsx` → Email Log
- `OperatorBroadcast.tsx` → Broadcast Email
- `InspectionBinderAdmin.tsx` → DOT Inspection Binder
- `EquipmentInventory.tsx` → Equipment Inventory
- Fleet Compliance, Dispatch Board, Driver Hub, Vehicle Hub, Document Hub, MO Plate Registry, Resource Center, Staff Directory, FAQ Manager, Pipeline Config, Activity Log, Content Manager, Forms Catalog, Carrier Signature, Lease Terminations, PEI Queue, Demo Mode — each page component gets the same one-line change.

For any header I find that lives inside a component shared with non-management contexts (e.g. Messages reused in the driver app), the icon prefix will be conditional or scoped to the management wrapper so the driver-facing view is not affected.

## Out of scope

- No change to sidebar visuals, ordering, labels, or grouping.
- No change to page content, filters, or actions — only the header row.
- Driver-facing / operator-facing headers are not touched.

## Technical notes

- New file: `src/pages/management/navIcons.tsx` exporting `NAV_ICONS: Record<string, LucideIcon>` and a small `<PageHeaderIcon path="..." />` helper for consistent sizing.
- Icons must not shrink on narrow widths — add `shrink-0` on each icon.
- If a header uses a custom color (e.g. `text-foreground` on a dark section), the icon inherits or is explicitly set to match — no white-on-white surprises.
