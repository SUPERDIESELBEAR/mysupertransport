

## Clarifying What "Stage 8" Is and Where It Currently Lives

This is a great question. There are actually **two separate systems** in this app that both use the word "stage" — and they have been partially crossed, which is the source of the confusion.

---

### The Two Systems

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  SYSTEM 1: OPERATOR PORTAL (operator's view)                            │
│  A checklist of 8 steps the operator must complete themselves.          │
│  Lives in: OnboardingChecklist.tsx / OperatorStatusPage.tsx             │
│                                                                          │
│  Stage 1: Background Check                                              │
│  Stage 2: Documents                                                      │
│  Stage 3: ICA Contract                                                   │
│  Stage 4: MO Registration                                                │
│  Stage 5: Equipment                                                      │
│  Stage 6: Insurance                                                      │
│  Stage 7: Go Live                                                        │
│  Stage 8: Contractor Pay Setup  ← operator fills out a form             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SYSTEM 2: STAFF PIPELINE DASHBOARD (staff's view)                     │
│  A tracker for staff to manage and monitor all operators.               │
│  Lives in: PipelineDashboard.tsx / OperatorDetailPanel.tsx              │
│                                                                          │
│  7-node progress track: BG → Docs → ICA → MO → Equip → Ins → Go Live  │
│  Driven by the pipeline_config database table.                          │
│  Currently has NO Stage 8 / Pay node.                                   │
│                                                                          │
│  The OperatorDetailPanel (what opens when you click an operator)        │
│  DOES already have a "Stage 8 — Contractor Pay Setup" read-only        │
│  section at the bottom that shows what the operator submitted.          │
│  But it is NOT in the 7-node progress track at the top.                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### What Has Been Done vs. What Still Needs Doing

| Area | Status |
|------|--------|
| Operator can see/access Stage 8 form in their portal | Fixed (buttons now visible) |
| Staff can see submitted pay setup data in the detail panel | Already done — section exists at the bottom of the panel |
| Staff progress track (7 nodes) shows a "Pay" node | **Not done** |
| pipeline_config database has a Stage 8 row | **Not done** — only 7 rows exist |
| OperatorRow fetch includes `pay_setup_submitted` field | **Not done** |
| Clicking "Pay" node navigates to Stage 8 section | **Not done** |

---

### What the Plan Would Build

Add a **Pay** node (8th node) to the staff-side progress track, so it appears alongside BG → Docs → ICA → MO → Equip → Ins → Go Live → Pay.

**Step 1 — Database:** Insert a `pay_setup` row into `pipeline_config` (stage_order 8, label "Pay", full_name "Contractor Pay Setup") with one item: `pay_setup_submitted` = "true".

**Step 2 — PipelineDashboard.tsx:**
- Add `pay_setup_submitted: string` to the `OperatorRow` type
- In `fetchOperators`, join to `contractor_pay_setup` and derive `pay_setup_submitted` as `"true"` when `submitted_at` is not null and `terms_accepted = true`, otherwise `""`
- Add `pay_setup: 'stage8'` to `STAGE_KEY_TO_DETAIL` so clicking the Pay node scrolls to Stage 8 in the detail panel
- Add `'Stage 8 — Pay Setup'` to the `STAGES` filter array and update `computeStage()` to include it

No new files. No operator portal changes. No new edge functions. No schema changes.

---

### Summary for Giving Instructions in the Future

- "**Operator portal Stage 8**" = the form/checklist item the operator sees and fills out
- "**Staff pipeline Stage 8 / Pay node**" = the tracking node staff sees in the progress track dashboard
- These are independent and each needs to be explicitly built

