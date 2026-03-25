
## Plan: Payroll Doc Acknowledgment — Gating, Reordering & Staff Visibility

### What needs to change

**1. Operator Portal — reorder & gate the form**
Move the "Payroll Reference Documents" acknowledgment section to the top of Stage 8, before the Contractor Type / Legal Name / Contact Info fields. The form fields below will be visually disabled (grayed out, non-interactive) until both toggles are acknowledged. This makes the intent unmistakable: read first, then fill in details.

**2. Database — persist acknowledgments**
Add two boolean columns to `contractor_pay_setup`:
- `deposit_overview_acknowledged` (boolean, default false)
- `payroll_calendar_acknowledged` (boolean, default false)

This allows the Staff Portal to display whether the operator has actually acknowledged each document, and ensures the acknowledgment survives page refreshes.

**3. Staff Portal — acknowledgment status display**
In the Stage 8 section of the Operator Detail Panel, add an "Operator Acknowledgments" row alongside the existing payroll info. Show each document with a green "Acknowledged" badge or a gray "Not yet" indicator so staff can confirm at a glance.

---

### Files to change

- **Migration**: Add `deposit_overview_acknowledged` and `payroll_calendar_acknowledged` columns to `contractor_pay_setup`
- **`src/components/operator/ContractorPaySetup.tsx`**:
  - Move the "Payroll Reference Documents" card to the very top of the form (above Contractor Type)
  - Add a conditional lock/dimmed state on all fields below until `allDocsAcknowledged === true`
  - Save acknowledgment flags to the database on form submit (include them in the `payload`)
- **`src/pages/staff/OperatorDetailPanel.tsx`**:
  - Add an "Operator Acknowledgments" display row within the Stage 8 read-only section
  - Show two labeled status chips (one per document): green "Acknowledged" or gray "Not yet"

---

### Technical notes

- The form fields below the docs section will use `pointer-events-none opacity-50` + an informational banner ("Acknowledge both documents above to unlock this form") until both toggles are on
- Acknowledgment values are written to DB at submit time (not on toggle), keeping the existing single-submit flow
- No new RLS changes needed — existing operator insert/update policies on `contractor_pay_setup` cover the new columns
- Staff view reads the same `contractor_pay_setup` record already fetched, just surfaces the two new fields
