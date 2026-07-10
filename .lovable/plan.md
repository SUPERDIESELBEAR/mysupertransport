## Rename Stage 9 to "Payroll and Procedures"

Update the Stage 9 title everywhere it renders so it reflects all four documents it covers (Payroll Setup, BOL Procedures, Handbook, Load Out Procedures). This is a label-only change — no logic, routing, or data-model changes.

### Frontend edits
- **`src/pages/staff/PipelineDashboard.tsx`**
  - Line 513: `'Stage 9 — Pay Setup'` → `'Stage 9 — Payroll and Procedures'`
  - Line 524 (short-label map key): update the key to the new full name; keep short label `'Pay'` (fits the pipeline column chip).
- **`src/pages/staff/OperatorDetailPanel.tsx`**
  - Line 6229 comment and line 6245 header: `Stage 9 — Contractor Pay Setup` → `Stage 9 — Payroll and Procedures`.
- **`src/pages/operator/OperatorPortal.tsx`**
  - Line 1786 header: `Stage 9 — Contractor Pay Setup` → `Stage 9 — Payroll and Procedures`.
  - Optional: update the subheading copy to mention the four documents.

### Database edit (pipeline_config)
- Migration to update the `pay_setup` row:
  - `full_name`: `Contractor Pay Setup` → `Payroll and Procedures`
  - `label` (short chip): keep `Pay` (fits narrow pipeline column). Change to `Payroll` if you'd prefer.
  - `description`: update to reference the four documents.

### Left unchanged (intentional)
- Internal keys (`pay_setup`, `pay-setup` view, `stage8` grid key, `pay_setup_submitted` notification type) — renaming these would ripple into triggers, notifications, and edge functions with no user-visible benefit.
- The existing `ContractorPaySetup` form component and its "Pay Setup Submitted" confirmation copy — that's the internal name of the form itself, not the stage title.
- Staff notification preferences copy referencing "Stage 8 (Contractor Pay Setup)" — separate follow-up if you want those relabeled too.

### Confirm before I build
Short chip label stays `Pay` — OK, or change to `Payroll`?
