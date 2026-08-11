# Match the driver app Dispatch icon to the management dashboard

The management dashboard sidebar uses the shipping-container icon for "Dispatch Board", while the driver app's Dispatch nav item uses a truck icon (the same icon already used for "My Truck", which makes the two entries look alike).

## Change

Swap the driver app Dispatch icon to the container icon so both apps match, in the sidebar/nav list and in the mobile bottom bar.

## Technical detail

In `src/pages/operator/OperatorPortal.tsx`:
- Import `Container` from `lucide-react`.
- Line ~1202 (nav items): `Dispatch` icon `<Truck className="h-5 w-5" />` becomes `<Container className="h-5 w-5" />`.
- Line ~1220 (mobile bottom-bar slot): same swap.
- Leave "My Truck" on the truck icon.
