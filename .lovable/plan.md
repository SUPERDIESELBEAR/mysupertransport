The status summary cards on the Onboard Systems page currently use `grid-cols-2 sm:grid-cols-4`, but there are five statuses (Available, Assigned, Damaged / Needs Repair, Lost/Missing, Deactivated). The fifth card wraps to a second row by itself.

Change the grid in `src/components/equipment/EquipmentInventory.tsx` to use a consistent 5-column layout so all five stat cards sit on the same row on `sm` and larger screens, matching the four device-type cards below. The row below will stay `grid-cols-2 sm:grid-cols-4` because it only has four device types.

Optional: consider reducing horizontal padding/font size slightly on the 5 cards so the labels still fit comfortably at typical desktop widths.