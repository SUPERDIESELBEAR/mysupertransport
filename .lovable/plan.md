
Yes — the operator-facing form is already built and wired up. What's missing is just the **payroll instructions content** inside the collapsible panel (lines 237–251 of `ContractorPaySetup.tsx`) and the `PayrollCalendar` component.

Here is exactly what the plan will do:

---

## What's being filled in

### 1. Replace the placeholder in `ContractorPaySetup.tsx` (lines 237–251)

The panel will be replaced with structured content from the PDF:

**Section layout inside the collapsible panel:**

- **Intro paragraph** — "SUPERTRANSPORT operates a structured weekly settlement system designed for accuracy, transparency, and consistency."

- **3 numbered cards** (Work Week / Reconciliation Period / Payday):
  - Work Week: "Wednesday 12:00 a.m. through Tuesday 11:59 p.m. All loads delivered during this period are grouped together for settlement."
  - Reconciliation Period: "After the Work Week closes, we verify delivery paperwork, revenue billing, fuel purchases, cash advances, approved accessorials, and authorized deductions."
  - Payday: "You are paid every Tuesday for the Work Week that ended two (2) Tuesdays prior."

- **`<PayrollCalendar />`** — embedded directly below the three cards

- **Detail rows** for Fuel, Accessorials, and Advances (collapsible-style, from PDF text)

- **"Simple Rule" callout box** — highlighted amber/gold box: *"You are paid every Tuesday for the Work Week that ended two Tuesdays prior."*

- **Warning strip** (already exists) — kept as-is below

---

### 2. Create `src/components/operator/PayrollCalendar.tsx`

The uploaded `PayrollCalendar.jsx` file could not be parsed directly, so the calendar will be **rebuilt from scratch** based on the PDF's calendar example:

```
Work Week:             Wed Jan 21 – Tue Jan 27    (blue)
Reconciliation:        Jan 28 – Feb 9             (orange)
Payday:                Tue Feb 10                 (green)
```

The component will be a TypeScript React component using Tailwind classes (matching the app's design system) showing three color-coded week blocks with labels and dates as illustrative examples.

---

### Files to change

| Action | File |
|--------|------|
| Create | `src/components/operator/PayrollCalendar.tsx` |
| Modify | `src/components/operator/ContractorPaySetup.tsx` — lines 237–251 only |

No database changes. No new routes. No other files touched.

---

### Note on the PayrollCalendar.jsx upload

The `.jsx` file could not be read as a document — it's code, not a parseable document format. The calendar will be rebuilt to match the design shown in the PDF example (three-column color-coded layout: blue Work Week → orange Reconciliation → green Payday). If you have specific styling from the original file you'd like preserved, you can paste the code directly into chat and it will be matched exactly.
