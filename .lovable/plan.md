
# Move PE Screening into its own stage (new Stage 6)

Split all Pre-Employment Screening fields out of **Stage 1 — Background Check** into a new dedicated stage inserted between the current Equipment Setup and Insurance stages. Renumber downstream stages accordingly.

## Final stage order

```text
Stage 1 — Background Check           (MVR + CH only)
Stage 2 — Documents
Stage 3 — ICA
Stage 4 — Missouri Registration
Stage 5 — Equipment Setup
Stage 6 — Pre-Employment Screening   ← NEW
Stage 7 — Insurance                  (was 6)
Stage 8 — Go Live & Dispatch         (was 7)
Stage 9 — Contractor Pay Setup       (was 8)
```

New stage key: `pe` (label `PE`, short badge `PE`, teal-adjacent color to sit between Equip orange and Ins teal — proposed `bg-cyan-500`).

## What moves into the new stage

The following fields (currently rendered inside the Stage 1 card in `OperatorDetailPanel.tsx`) move as a single block into the new Stage 6 card:

- `pe_screening` (status select)
- `pe_scheduled_date`
- `pe_results_date`
- `qpassport_url` (QPassport PDF viewer + replace)
- `pe_receipt_url` / `pe_receipt` operator-uploaded doc row
- `pe_screening_result`
- `pe_results_doc_url` (PE Results Document upload)

Stage 1 will retain only MVR, Clearinghouse, MVR/CH Approval, and Background Check Notes.

## Completion rule changes

- **Stage 1 (Background) complete** = `mvr_ch_approval === 'approved'` (PE clear no longer required).
- **Stage 6 (PE Screening) complete** = `pe_screening_result === 'clear'`.
- Alert flag stays: `pe_screening_result === 'non_clear'` still surfaces a warning, but now attributed to Stage 6.

## Database changes

Single migration:

1. `INSERT` new `pipeline_config` row: `stage_key='pe'`, `stage_order=6`, `label='PE'`, `full_name='Pre-Employment Screening'`, items = the PE checklist entries (was_scheduled, receipt_uploaded, result_clear).
2. Shift existing rows: `ins` → order 7, `dispatch` → order 8, `pay_setup` → order 9 (idempotent-guarded).
3. No `onboarding_status` column changes — PE fields already exist.
4. No changes to milestone trigger keys (`background_check_cleared`/`background_check_flagged`); the underlying trigger already keys on `pe_screening = 'scheduled'` and can remain — it just now represents the new stage's kickoff.

## Frontend renumbering (mechanical)

Files touched and the shape of each edit:

- **`src/pages/staff/OperatorDetailPanel.tsx`** (largest touch)
  - Lift the PE subsection (~lines 4507–4620) out of the Stage 1 card and drop it into a new Stage 6 card rendered between the current Stage 5 (Equipment) and Stage 6 (Insurance) blocks.
  - Rename the following existing headings: `Stage 6 — Insurance` → `Stage 7`, `Stage 7 — Go Live & Dispatch Readiness` → `Stage 8`, `Stage 8 — Contractor Pay Setup` → `Stage 9`.
  - Add `stage6` (new PE) to every stage-key array: `autoCollapse` set, `allKeys`, `stickyAllKeys`, `allStageKeys`, both `stages[]` arrays, all three dot/pill strips (2510, 3575, 4308), and shift existing `stage6→stage7`, `stage7→stage8`, `stage8→stage9` throughout.
  - Update refs (`stage1Ref`…`stage8Ref`) and toggle handlers accordingly.
  - Update `s1Complete` to drop the PE clause; add `s6Complete = pe_screening_result === 'clear'`.
  - Update the two inline auto-collapse blocks (post-MVR-approval, post-CH-approval) so they no longer wait on PE.

- **`src/pages/staff/PipelineDashboard.tsx`**
  - `STAGE_KEY_TO_DETAIL`: add `pe: 'stage6'`, remap `ins/dispatch/pay_setup` to `stage7/8/9`.
  - `STAGES` array: insert `'Stage 6 — Pre-Employment'`, renumber later entries.
  - `STAGE_ABBR`: add `PE`, keep existing abbreviations otherwise.
  - `computeStage()`: add a branch for `pe_screening_result === 'clear'` returning the new Stage 6 label, positioned between Equipment and Insurance.
  - `computeTemperature()` tooltip strings that enumerate "Stages 1 & 2" etc. — leave text ranges unchanged (they describe early-pipeline heat, not the new stage).

- **`src/pages/management/ManagementPortal.tsx`**
  - Pill strip labels (`:919–924`): insert `'Stage 6 — PE'` in order; keep short-form `PE`.
  - `StageBreakdown` type + accumulator (`:65–70`, `:168`, `:500–517`): add `stage6_pe_screening` bucket, rename existing `stage6_insurance` → `stage7_insurance`, add `stage8_go_live` and `stage9_pay_setup` if we want breakdown parity (out of scope — leave existing 6-bucket summary alone, only renaming `stage6_insurance` key/label to Stage 7).

- **`src/pages/operator/OperatorPortal.tsx`**
  - `stages[]` (`:713–825`): insert new entry `{ number: 6, title: 'Pre-Employment Screening', ... }`, renumber Insurance/Go Live/Pay to 7/8/9.
  - `getStageStatus(1)`: remove `pe_screening_result` requirement; add a new `getStageStatus(6)` covering PE.
  - Stage 8 heading string (`:1714`) becomes `Stage 9 — Contractor Pay Setup`.

- **`src/components/operator/SmartProgressWidget.tsx`**
  - Add a `WHATS_NEXT_STAGES` entry for number 6 (PE) between Equipment (5) and Insurance (which becomes 7). Move existing entry 6 (Insurance) to 7. Leave 8/9 absent as today.
  - `STAGE_INFO[1]` blocker: drop `pe_screening_result === 'non_clear'` and `pe_screening === 'scheduled'` clauses (they belong to Stage 6).
  - Icon switch (`:678–682`): add a case for `activeStage.number === 6`.

- **`src/components/operator/OperatorStatusPage.tsx`**
  - Three "Stage 1 card" strings for receipt-upload prompt (`:526`, `:685`, `:721`) → "Stage 6 card".

- **`src/components/operator/OnboardingChecklist.tsx`**
  - PE timeline trigger (`:152`): change from `stage.number === 1` to `stage.number === 6`.
  - Deep-link/not-started special cases for `stage.number === 8` → `stage.number === 9`.

- **`src/components/management/PipelineConfigEditor.tsx`**
  - `NODE_COLORS` / `NODE_DOT_COLORS`: add `pe: 'bg-cyan-500/15 text-cyan-700 border-cyan-200'` and `pe: 'bg-cyan-500'`.

- **Edge functions (string-only edits)**
  - `supabase/functions/invite-operator/index.ts` — update the "Stage X —" comments to match new numbering (test-operator seed already sets `pe_screening: 'results_in'`, `pe_screening_result: 'clear'`, no logic change).
  - `supabase/functions/send-insurance-request/index.ts:199` — `"Please add recipients in Stage 6."` → `"Stage 7"`.
  - `supabase/functions/send-lease-termination/index.ts:152` — `"Stage 6 Insurance Settings"` → `"Stage 7 Insurance Settings"`.
  - `supabase/functions/notify-pay-setup-submitted/index.ts:151` — `"Stage 8 (Contractor Pay Setup)"` → `"Stage 9 (Contractor Pay Setup)"`.

## Out of scope

- No changes to notification milestone keys, PE email templates, PE queue behavior, or any of the PEI (previous-employer investigation) system — that's a separate feature.
- No new columns on `onboarding_status` or `pipeline_config`.
- Header dot/pill strip does not gain a Stage 9 dot on views that currently stop at 6 or 8 — parity with existing coverage.

## Verification

- Load Emma Mueller's detail panel and confirm Stage 1 shows only MVR + CH; new Stage 6 card renders with all PE fields, and stages 7/8/9 display correctly.
- With MVR/CH approved and PE not clear: Stage 1 pill becomes green, Stage 6 pill remains amber.
- Toggle PE result to `clear` and confirm Stage 6 pill flips to green and the operator-facing progress widget advances.
- Confirm the operator portal shows an active Stage 6 card with the QPassport / receipt / results controls.
- Run the Supabase linter and confirm no new warnings.
