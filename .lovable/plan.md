

## Vehicle Hub — Fleet Maintenance & DOT Inspection Tracker

### What it adds

A new **"Vehicle Hub"** sidebar menu item in the Staff Portal (and Management Portal) that provides a centralized view for tracking truck repairs, maintenance costs, and DOT periodic inspection scheduling. Operators get a read-only "My Truck" section in their portal.

### Database

**Table: `truck_maintenance_records`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| operator_id | uuid NOT NULL | References operators.id |
| service_date | date NOT NULL | |
| odometer | integer | |
| shop_name | text | |
| amount | numeric(10,2) | |
| description | text | |
| invoice_number | text | |
| categories | text[] DEFAULT '{}' | pm_service, general_repair, tires (multi-select) |
| invoice_file_url | text | |
| invoice_file_path | text | |
| invoice_file_name | text | |
| notes | text | |
| created_by | uuid | |
| created_at | timestamptz DEFAULT now() | |

**Table: `truck_dot_inspections`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| operator_id | uuid NOT NULL | References operators.id |
| inspection_date | date NOT NULL | |
| reminder_interval | integer DEFAULT 360 | 90, 180, 270, or 360 days |
| next_due_date | date | Computed on insert/update via trigger |
| inspector_name | text | |
| location | text | |
| result | text DEFAULT 'pass' | pass / fail / conditional |
| certificate_file_url | text | |
| certificate_file_path | text | |
| certificate_file_name | text | |
| notes | text | |
| created_by | uuid | |
| created_at | timestamptz DEFAULT now() | |

RLS: Staff full CRUD on both tables. Operators SELECT their own records (via operators.user_id = auth.uid()).

A trigger on `truck_dot_inspections` auto-computes `next_due_date = inspection_date + reminder_interval days` on INSERT/UPDATE.

### Front-end components

**`src/components/fleet/FleetRoster.tsx`** — Main list view
- Table: Unit #, Driver Name, Truck Owner, Year/Make/Model, VIN, Total Repair Cost, DOT Status badge (color-coded countdown)
- Search bar, click row to open detail drawer

**`src/components/fleet/FleetDetailDrawer.tsx`** — Slide-in panel
- Truck header info
- DOT Periodic Inspections section with countdown, interval selector, certificate upload
- Repairs & Maintenance table with running total, category badges, search/filter by category and date range
- Add Record / Add Inspection buttons

**`src/components/fleet/MaintenanceRecordModal.tsx`** — Add/edit form
- Date (DateInput), odometer, shop name, amount, description, invoice #, category checkboxes (PM Service / General Repair / Tires), invoice upload, notes

**`src/components/fleet/DOTInspectionModal.tsx`** — Add/edit form
- Inspection date, inspector name, location, result radio, reminder interval radio group (90/180/270/360), certificate upload, notes

### Integration points

**Staff Portal (`StaffPortal.tsx`)**
- New sidebar nav item: "Vehicle Hub" with Truck icon, placed under the Driver Hub item
- New view state and route rendering FleetRoster → FleetDetailDrawer

**Management Portal (`ManagementPortal.tsx`)**
- Same Vehicle Hub view embedded via the existing portal reuse pattern

**Operator Portal (`OperatorPortal.tsx`)**
- New "My Truck" tab showing read-only DOT inspection history with countdown and maintenance record list

**DOT Inspection Notifications**
- Extend `check-cert-expiry` edge function to also query `truck_dot_inspections` for upcoming `next_due_date` values, alerting at 30/14/7-day thresholds via in-app notifications

### Files changed

| File | Change |
|------|--------|
| Migration | Create both tables, RLS policies, next_due_date trigger |
| `src/components/fleet/FleetRoster.tsx` | **New** |
| `src/components/fleet/FleetDetailDrawer.tsx` | **New** |
| `src/components/fleet/MaintenanceRecordModal.tsx` | **New** |
| `src/components/fleet/DOTInspectionModal.tsx` | **New** |
| `src/pages/staff/StaffPortal.tsx` | Add "Vehicle Hub" nav item and view |
| `src/pages/management/ManagementPortal.tsx` | Add "Vehicle Hub" nav item and view |
| `src/pages/operator/OperatorPortal.tsx` | Add read-only "My Truck" tab |
| `supabase/functions/check-cert-expiry/index.ts` | Add DOT inspection due date checks |

