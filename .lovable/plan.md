## Findings

### 1. Current categories and data source
The section is titled **"App Install Status"** in `src/pages/management/ManagementPortal.tsx` (lines 1282–1360). It renders three category counters:

| Category | Definition |
|---|---|
| **Installed** | `operators.pwa_installed_at IS NOT NULL` |
| **Web only** | `pwa_installed_at IS NULL` AND `last_web_seen_at IS NOT NULL` |
| **Never signed in** | Both `pwa_installed_at` AND `last_web_seen_at` are null |

Data comes from `fetchInstallStats` (lines 630–641), which queries `operators` for `is_active = true` and pulls only three columns: `id, pwa_installed_at, last_web_seen_at`. The result is reduced to counts and stored in `installStats`; individual driver identities are discarded.

### 2. Are names available?
No — the current query does not select names. `operators` has no name columns; driver names live on the joined `applications` row (`first_name`, `last_name`). To render per-driver lists we need to expand `fetchInstallStats` to include `application_id` and inner-join `applications(first_name, last_name)`, then keep the rows (bucketed by category) in state alongside the counts. It stays a single query — no extra round-trip — and applies existing RLS.

### 3. Design reference on the same Overview page
Yes. The **Compliance Summary** card (`src/components/inspection/InspectionComplianceSummary.tsx`) sitting immediately above/near this card is already collapsible: it uses an `expanded` boolean toggled by a chevron button (`ChevronDown` / `ChevronUp` from `lucide-react`) in the header, and reveals grouped driver rows below. That's the closest sibling pattern and gives us consistent visuals (same chevron placement, same divide-y row list treatment already used in the Pending queue below).

No other card on the Overview page uses per-category driver drilldowns, so this widget will be first — but the interaction (chevron toggle + `divide-y` list of drivers) already exists in the compliance card to mirror.

## Proposed change (pending your approval)

1. Extend `fetchInstallStats` to also select `application_id, applications!inner(first_name, last_name)` and, alongside the count totals, bucket rows into three arrays: `installedDrivers`, `webOnlyDrivers`, `neverSignedInDrivers` (each `{ id, name }[]`, alphabetized).
2. Add three independent `expanded` booleans (one per category) and render a chevron toggle on each of the three count tiles (lines 1342–1355).
3. When a tile is expanded, render a `divide-y divide-border` list of driver names beneath the tile grid, matching the Pending Applications row styling already used in the same file. Empty lists show a muted "No drivers" placeholder.
4. No changes to the counts, progress bar, or send-email buttons; no schema changes; no other Overview cards touched.

Awaiting your approval to proceed.
