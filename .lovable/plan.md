

## Consolidate Service Library + Resources into "Resource Center"

### Summary

Merge the two separate sidebar items ("Service Library" and "Resources") into a single "Resource Center" item across all three portals. Inside, a tabbed interface provides two tabs: **Services & Tools** and **Company Documents**.

### Changes by File

**1. `src/pages/management/ManagementPortal.tsx`**
- Remove the separate `service-library` and `resources` nav items
- Add a single `resource-center` nav item (icon: `BookOpen`, placed where Service Library was)
- Update the `ManagementView` type to replace both with `resource-center`
- Update all view-string arrays (URL parsing, validation)
- Replace the two render blocks with one that renders a tabbed Resource Center:
  - Tab 1: "Services & Tools" → renders `<ServiceLibraryManager />`
  - Tab 2: "Company Documents" → renders `<ResourceLibraryManager />`

**2. `src/pages/staff/StaffPortal.tsx`**
- Same pattern: remove `service-library` and `resources` nav items, add `resource-center`
- Update the `StaffView` type and view-string arrays
- Replace two render blocks with one tabbed Resource Center (same two tabs)

**3. `src/pages/operator/OperatorPortal.tsx`**
- Remove separate `service-library` and `resources` nav items
- Add single `resource-center` nav item (label: "Resource Center", icon: `BookOpen`)
- Update the `OperatorView` type and view-string arrays
- Replace two render blocks with one tabbed view:
  - Tab 1: "Services & Tools" → renders `<DriverServiceLibrary />`
  - Tab 2: "Company Documents" → renders `<OperatorResourceLibrary />`

### No Database or Backend Changes

All existing tables (`services`, `service_resources`, `resource_documents`) remain unchanged. This is purely a navigation/UI consolidation.

### Technical Detail

Each portal's Resource Center will use the existing `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` components from `@/components/ui/tabs`. The default tab will be "Services & Tools". URL deep-linking to the Resource Center will use `?view=resource-center` (staff/management) or `?tab=resource-center` (operator).

