

### Goal
Replace the passenger-car icon (`CarFront`) on **Vehicle Hub** with a more appropriate trucking-industry icon, since SUPERDRIVE serves a trucking fleet.

### Current State
| Item | Current Icon | Where |
|---|---|---|
| Vehicle Hub | `CarFront` (passenger car) | Staff sidebar, Management sidebar |
| Vehicle Hub page header | `Truck` | `FleetRoster.tsx` |
| Dispatch Board | `Truck` | Management + Dispatch sidebars |

So the page header for Vehicle Hub is already a `Truck` — only the **sidebar nav icons** show the car. Both Vehicle Hub and Dispatch Board would also collide visually if both used `Truck`.

### My Recommendation
Use **two distinct truck-family icons** so the sidebar stays scannable:

- **Vehicle Hub** → `Container` (a trailer/box — represents the fleet of trucks/trailers in inventory)
  *Alternative:* `Caravan` (trailer silhouette)
- **Dispatch Board** → keep `Truck` (cab in motion — represents trucks being dispatched/on the road)

This gives a clear mental model: **Truck on the road = Dispatch**, **Trailer/Container in the yard = Vehicle Hub (inventory)**.

### Files to Change
| File | Change |
|---|---|
| `src/pages/staff/StaffPortal.tsx` | Swap `CarFront` → `Container` on Vehicle Hub nav item; update lucide-react import |
| `src/pages/management/ManagementPortal.tsx` | Same swap; update import |

No DB, no logic, no other UI affected. ~4 lines total.

### Quick Question Before I Build
Which icon do you want for **Vehicle Hub**?

