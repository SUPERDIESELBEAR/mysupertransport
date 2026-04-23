

## Remove "Onboarding Staff Workload" from Overview

### Change

In `src/pages/management/ManagementPortal.tsx`, delete the entire **Staff Workload** card on the Overview view (lines 1165–1391). This removes:

- The "Onboarding Staff Workload" header + "Manage Staff" link
- The per-coordinator rows (counts, load badges, stage progress bars, tooltips)
- The "Unassigned operators" row
- The stage color **filter chip legend** at the bottom of that card (Background / Documents / ICA / MO Reg / Equipment / Insurance / Onboarded)

### Heads-up on the filter chips

The stage filter chips currently live inside the workload card's footer — removing the card removes them from Overview too. They're still fully available **inside the Pipeline view itself** (same chips, same behavior), so no functionality is lost; you just lose the one-click shortcut from Overview. If you want me to preserve those chips as their own small bar on Overview, say the word and I'll lift them out before deleting the rest.

### What stays untouched

- The `staffWorkload`, `unassignedCount`, and `unassignedStages` data computations stay in place for now (cheap, and still used by the Pipeline view's coordinator filter). If you'd like them stripped too for a leaner Overview load, that can be a follow-up pass.
- All other Overview cards (KPIs, Compliance Risk, Expirations, Pending Application Reviews, etc.) are unchanged.
- The Staff page, Pipeline view, and coordinator filtering logic — all unchanged.

### Files touched

- `src/pages/management/ManagementPortal.tsx` — single block deletion (lines 1165–1391).

### Out of scope

- Removing the underlying `staffWorkload` queries/state.
- Relocating the stage filter chips to a different Overview spot (ask if you want this).

