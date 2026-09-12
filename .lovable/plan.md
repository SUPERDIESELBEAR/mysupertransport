# Recovered report — the three sweeps from the 2026-09-11/12 pass

Read-only. Nothing was changed. Live counts queried today; headings and pickers read from current source.

## 1. Page name audit

The convention (from the Applications page, now `src/components/shared/PageHeading.tsx`): the page shows **exactly its menu label** as its title, plus one short line saying what it is for.

### Compliant — title matches the menu item and has the short line

Management: Applications, Driver Hub, Fleet Compliance, Document Hub, Paper Logs (RODS), Lease Terminations, Dispatch Board, Driver Status, Rate Con Inbox, Fuel Import, Driver Fuel Detail, Fuel Cost by Location, Billing Queue, Late Accessorials, Dispatch Settlement, Settlement Settings, Vehicle Hub, Inspection Program, Duplicate Plates, Onboard Systems, ELD Malfunctions, License Plate Registry, DOT Inspection Binder, Retention Archive, Notifications, Broadcast Email, Staff Directory, Pipeline Config, Carrier Signature, Forms Catalog, FAQ Manager, What's New, Email Log, Activity Log, Parser Diagnostics, Demo Accounts, Resource Center, Ownership Transfer, Settings, Help, Messages, Onboarding Pipeline.

Staff: Driver Hub, Vehicle Hub, Document Hub, Resource Center, FAQ Manager, Notifications.
Operator: My Documents, Resource Center, Paper Logs, My Settlements, My Fuel, Settlement Forecast, ELD Malfunction (last five have a title but **no** description line).

### Title present, no description line

Loads, Brokers, Facilities, Settlement Run, Driver App Preview, Create/Edit Load; Operator: My Settlements, My Fuel, Settlement Forecast, Paper Logs, ELD Malfunction, FAQ, Dispatch.

### No title at all

- Staff → Messages
- Dispatch → Messages
- Operator → Messages, Upload Documents, ICA

### Title disagrees with its menu name — both strings

| Portal | Menu says | Page says |
|---|---|---|
| Management | Overview | Management Overview |
| Management | PEI | Previous Employment Investigations |
| Management | Device Models | ELD Device Models |
| Staff | PEI Queue | Previous Employment Investigations |
| Staff | Compliance | Fleet Compliance |
| Staff | Inspection Binder | DOT Inspection Binder |
| Staff | Equipment | Onboard Systems |
| Staff | Applicant Pipeline | Onboarding Pipeline |
| Dispatch | Drivers | Driver Hub |
| Operator | Doc Hub | Document Hub |
| Operator | My Truck | Vehicle Detail / Unit {n} |
| Operator | Pay Setup | Stage 9 — Payroll and Procedures |
| Operator | Dispatch | Dispatch Status |
| Operator | FAQ | Frequently Asked Questions |

Deliberate exceptions: the Operator Home and My Progress pages greet the driver by name instead of naming the page; Inspection Calendar is a panel inside Inspection Program, not a page; public flow screens (apply, login, install, welcome) have no menu item.

Note: the same page appearing under different menu labels in different portals (Compliance/Fleet Compliance, Equipment/Onboard Systems, Drivers/Driver Hub, Applicant Pipeline/Onboarding Pipeline) means the mismatch cannot be fixed in the page — one of the two menu labels has to give.

### What the pass fixed vs left
Fixed: titles added to Driver Fuel Detail, Paper Logs (RODS), Retention Archive, Deactivate Driver; upgraded on Inspection Program and Duplicate Plates; renamed to the menu label on Fuel Import, Parser Diagnostics, Fuel Cost by Location, Dispatch Settlement, Driver App Preview.
Left: everything in the two tables above, and the PEI / Notifs menu abbreviations, which were raised as your call.

## 2. Pickers with many options and no type-ahead

Live sizes today: 59 active drivers (154 records), 219 onboard devices, 38 plates, 12 brokers, 7 dispatchers, 10 management users.

| Where | Picks | Options | Recommendation |
|---|---|---|---|
| Assign Plate (MO plates) | driver | ~59 | Convert — same job as Assign Device, which is already searchable |
| Retention Archive | driver filter | full roster (154) | Convert |
| Paper Logs (RODS) | driver filter | full roster (154) | Convert |
| Inspection Binder — bulk assign | driver | full roster | Convert |
| Staff Availability | driver | ~59 | Convert |
| Fuel Import | driver | ~59 unfiltered | Convert (search only — the list stays unfiltered on purpose) |
| Send Passenger Auth | driver | ~59 | Convert |
| Roadside Stop, ELD Malfunction wizard, ELD Device Data Quality | driver | ~59 | Convert |
| Add Driver — state, home state, license state (3 fields) | US state | 51 each | Reuse the existing searchable state picker; it already exists and these three rebuild it by hand |
| Assign Dispatcher (load detail) | dispatcher | 7 | Leave |
| Ownership Transfer | management user | 10 | Leave |
| ICA Amendment — unit | truck | unconfirmed | Check the list size, then decide |

Already searchable: Driver Fuel Detail, Assign Device, Create Assignment Sheet, Inspection Binder per-document, Assign Driver (load), brokers, facilities, states. Messages and Broadcast have their own search boxes. Short fixed lists (claim types, truck makes, days of week, statuses) are fine as they are.

## 3. Driver lists and the set-up filter

The filter means: active, not a demo account, fully onboarded, go-live date set, insurance date set.

Using it today: Driver Fuel Detail, and the Fuel Discount Pass-Through exceptions list in Settlement Settings.

**Should use it (pay-facing, not yet filtered)**
- Assign Driver on a load — assigning a load decides pay. Has its own eligibility model, so this needs a decision rather than a swap.
- Assign Plate, Assign Device, Create Assignment Sheet — only if plate and equipment charges become settlement deductions. Open question.

**Correctly unfiltered**
- Fuel Import — matches a whole card file; filtering would hide real transactions.
- Onboarding Pipeline, Add Driver, Driver Hub, Archived Drivers, Vehicle Hub, management onboarding dashboards — these exist to show unfinished and inactive drivers.
- Compliance, Inspection Program, Inspection Calendar, Inspection Binder — a driver still onboarding still has to be compliant.
- Messages, group members, Bulk Message, Broadcast Email, Assign Notification — you need to reach drivers mid-onboarding.
- Demo Accounts — the filter's job is to exclude demo drivers; this page is about them.
- Staff Availability, Driver App Preview, Launch Superdrive, Send Passenger Auth — operational, not pay.

A guard already fails if a pay screen goes back to building its own driver list, and it survives drivers being onboarded or terminated.

## 4. What the pass actually changed

- `src/lib/fuel/fuelOperators.ts` — added the filtered driver list used by pay screens.
- `src/pages/management/FuelDriverDetailPage.tsx` — filtered list, searchable picker, page title.
- `src/components/shared/DriverCombobox.tsx` (+ old path re-export) — the shared searchable driver picker, now searching name and unit.
- `src/components/shared/PageHeading.tsx` — the title-plus-one-line shape in one place.
- Titles/renames on the pages listed in section 1.
- `src/lib/fuel/__tests__/setUpOperatorOptions.test.ts` — guard.

Addressed findings 1, 2 and 3 for Driver Fuel Detail specifically; finding 4 confirmed no change (transaction rows stay net with the Discount column, deduction totals stay gross). Deliberately left: Fuel Import's unfiltered list, the other unsearchable pickers, the menu/title disagreements above.
