## Rename "Equipment Inventory" to "Onboard Systems"

Update both the management sidebar label and the page header/title so they match.

### Changes
1. **`src/pages/management/ManagementPortal.tsx`** — Update the sidebar nav item label from "Equipment Inventory" to "Onboard Systems" (under the Operations group).
2. **`src/components/equipment/EquipmentInventory.tsx`** — Update the page header/title text to "Onboard Systems" (keeping the existing gold icon).

### Out of scope
- No changes to component/file names, routes, database tables, or business logic — label text only.
