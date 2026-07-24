Replace the generic `ImageIcon` currently used for decal photos in Vehicle Hub cards with the `Badge` icon from `lucide-react` so it visually matches the company-emblem/decal concept, while the truck photos continue to use the `Truck` icon.

## Changes
- Update `src/components/fleet/FleetRoster.tsx`:
  - Import `Badge` from `lucide-react` (remove `ImageIcon` if no longer used).
  - Swap the icon in the decal-photo card row from `<ImageIcon>` to `<Badge>`.
  - Preserve existing gold color when photos exist, muted state when empty, click behavior, and accessibility labels.

## Scope
- Only affects the Vehicle Hub card view decal photo icon.
- No data model, navigation, or modal behavior changes.

## Verification
- Open the preview on the Vehicle Hub card view.
- Confirm each row now shows a Badge icon for Decal photos and a Truck icon for Truck photos.
- Confirm both icons still open their respective photo modals and carousels.