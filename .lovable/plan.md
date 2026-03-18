
## Answering the question + presenting the full Driver Hub plan

### Direct Answer: Yes — everything is already built and reusable

The `OperatorDetailPanel` (2,396 lines) is the existing driver detail view used today in the Pipeline. It already contains:

- **Per-driver Inspection Binder** — via the embedded `OperatorBinderPanel` component which handles CDL, Med Cert, DOT Inspections, Lease Agreement + Driver Uploads (roadside inspection reports, maintenance receipts)
- **ICA management** — issue, view, void contracts per driver
- **Dispatch status + full history timeline** — change status, view log
- **Compliance expiry pills** — CDL and Med Cert with color-coded urgency, inline date editing, cert reminder history
- **Document files** (operator_documents table) — attached docs per stage
- **Internal notes** — staff-only notes field
- **Messaging** — message thread opener for each driver
- **Invite resend** — resend portal invite

The `InspectionBinderAdmin` tab already exists for company-wide docs (IRP, Insurance, IFTA, ELD, Accident Packet, etc.) and fleet-level sharing.

The **Driver Hub simply needs to be wired as a new top-level view** that surfaces these existing components in a driver-centric context rather than a pipeline/onboarding context.

---

## Implementation Plan: Driver Hub

### What gets built

**1. `DriverRoster.tsx`** — new component
- Queries `operators` → `onboarding_status` (filter `fully_onboarded = true`) → `active_dispatch` → `applications` (name, phone, state, CDL expiry, med cert expiry)
- Columns: Unit #, Driver Name, Phone, Home State, Dispatch Status badge, CDL expiry pill, Med Cert expiry pill, Actions (Message, Open)
- Search by name/unit, filter by dispatch status
- Clicking a row opens the existing `OperatorDetailPanel` — no new detail view needed, everything is already there including the Inspection Binder

**2. `DriverHubView.tsx`** — thin wrapper (management/staff only)
- Header: "Active Drivers" title + "Add Driver" button (management only) + search/filter bar
- Body: `DriverRoster` → on row click → `OperatorDetailPanel` with `onBack` returning to roster
- Reuses the existing `BulkMessageModal` for bulk messaging via checkboxes

**3. Wire into portals**

| Portal | Change |
|---|---|
| `StaffPortal.tsx` | Add `'drivers'` to `StaffView` + nav item (Users2 icon, between Pipeline and Messages) |
| `ManagementPortal.tsx` | Add `'drivers'` to `ManagementView` + nav item + "Active Drivers" metric card on Overview |
| `DispatchPortal.tsx` | Add a "Drivers" tab showing roster with dispatch-focused columns only (unit, name, status, lane, ETA) — no detail panel needed here, just a quick reference list |

**4. Add Driver modal** (management only) — `AddDriverModal.tsx`
- Fields: First name, Last name, Email, Phone, Unit #, CDL #, CDL State, CDL Expiry, Med Cert Expiry
- On submit: calls the existing `invite-operator` edge function pattern — creates `operators` row + `onboarding_status` with `fully_onboarded = true` + sends invite email
- Needs a small DB migration: insert into `applications` (minimum fields: first_name, last_name, email, cdl_number, cdl_state, cdl_expiration, medical_cert_expiration) → then `operators` → then `onboarding_status` with `fully_onboarded = true`

### Auto-promotion
No trigger change needed. The roster query always derives its list from `onboarding_status.fully_onboarded = true`, so any operator marked fully onboarded in the Pipeline will immediately appear in the Driver Hub on next load/refresh.

### Files to create
- `src/components/drivers/DriverRoster.tsx`
- `src/components/drivers/DriverHubView.tsx`
- `src/components/drivers/AddDriverModal.tsx`

### Files to modify
- `src/pages/staff/StaffPortal.tsx` — add `'drivers'` view + nav item
- `src/pages/management/ManagementPortal.tsx` — add `'drivers'` view + nav item + metric card
- `src/pages/dispatch/DispatchPortal.tsx` — add lightweight Drivers tab (read-only roster, no detail panel)

### DB migration needed
One migration to support "Add Driver" path: a stored procedure or client-side sequence that creates `applications`, `operators`, `onboarding_status` (fully_onboarded=true), and `active_dispatch` rows in a single transaction. Alternatively, the existing `invite-operator` edge function can be extended to accept a `bypass_application` flag.

No new tables needed. All existing RLS policies cover the new queries since they already allow staff to read `operators + onboarding_status + active_dispatch`.
