# Vehicle Hub — action button cleanup

## What changes

**Table view actions column**
- All action buttons get the same square outlined treatment as the "+" (Log Update) button: same size, same bordered box, same spacing. Truck photos, decal photos, edit, and log update all read as one consistent row of square icon buttons.
- The "…" (more actions) menu is removed from the table view.

**Card (list) view**
- The "…" menu is removed from the card footer as well.

**Deactivate & Delease**
- The red "Deactivate & Delease" action no longer lives in the roster's "…" menus. It moves into the vehicle detail page (the screen you land on after clicking a driver's row/card), shown in the header next to the unit title.
- Same placement handles the reverse case: if the unit is deactivated, the header shows the gold "Reactivate Unit" action instead.
- Only management/owner roles see these actions, matching today's permission check.
- The existing inline "Reactivate" buttons on deactivated roster rows/cards stay, so deactivated units are still recoverable directly from the roster.
- "Open driver profile" from the "…" menu is not lost — clicking the row/card already opens the profile.

**Photo icon hover text**
- Truck icon with no photos: tooltip reads "No truck photos".
- Decal icon with no photos: tooltip reads "No decal photos".
- Because disabled buttons swallow hover in some browsers, these icons stay visually disabled-looking but remain hoverable so the tooltip always appears; clicking does nothing when there are no photos.

## Technical notes

- `src/components/fleet/FleetRoster.tsx`
  - Table actions cell: unify all icon buttons to `size="icon" variant="outline" h-7 w-7`; delete the `DropdownMenu` block; drop now-unused `MoreHorizontal`/`UserX` imports if nothing else uses them.
  - Card footer: delete the `DropdownMenu` block; keep Edit + Log Update.
  - Replace `disabled` on the photo buttons with a no-op click guard + `aria-disabled` and muted styling so `title` tooltips fire; set titles to "No truck photos" / "No decal photos".
- `src/components/fleet/FleetDetailDrawer.tsx`
  - Fetch/derive `deactivated_at` for the operator and read the current user's role (same `isManagement || isOwner` check used in `FleetRoster`).
  - Add a header-right action: destructive "Deactivate & Delease" → `navigate('/management/deactivate/<operatorId>')`, or gold "Reactivate Unit" when deactivated (reusing the roster's reactivate confirm flow).
  - Hidden entirely when `readOnly` (driver portal usage).
