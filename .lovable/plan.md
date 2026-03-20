
## Understanding current state
The Pipeline Dashboard currently shows per row:
- A "Current Stage" text badge (e.g. "Stage 3 — ICA") + % number
- A thin progress bar below it
- A separate "Progress" column (duplicate bar)

All the raw data needed for per-item visibility is already in the `OperatorRow` interface — `mvr_ch_approval`, `pe_screening_result`, `form_2290`, `truck_title`, `truck_photos`, `truck_inspection`, `ica_status`, `mo_reg_received`, `decal_applied`, `eld_installed`, `fuel_card_issued`, `insurance_added_date`.

## The answer to "best way to see sub-items"

The cleanest approach is **hover tooltips on each stage node** in the mini progress track. No extra clicks, no expanded rows, no additional columns. Each node shows a compact breakdown of its constituent items when hovered:

```text
  BG ─── Docs ─── ICA ─── MO ─── Equip ─── Ins
  ✓       ◑        ●       ○        ○         ○

Hover "Docs" node:
┌─────────────────────────┐
│ Documents               │
│ ✓ Form 2290 — received  │
│ ✓ Truck Title — received│
│ ✗ Truck Photos          │
│ ✗ Truck Inspection      │
└─────────────────────────┘
```

This is better than expandable rows (too much space), inline sub-columns (too wide), or a click-through panel (too many clicks).

## What I'll build

### 1. Replace the stage column content
The "Current Stage" cell currently shows a badge + bar. Replace it with the 6-node horizontal track:
- Each node = small circle (20×20px) with label underneath (BG, Docs, ICA, MO, Equip, Ins)
- Connector lines between nodes, turning green when the left node is complete
- State coloring: green fill + check = complete, amber ring + dot = partial/in-progress, gray = not started

### 2. Per-stage completion logic (parallel, not waterfall)
Each node is computed independently from its own fields — no sequential dependency:

| Node | Complete when | Partial when |
|------|--------------|--------------|
| BG | `mvr_ch_approval === 'approved'` | `mvr_status` or `ch_status` is in-progress |
| Docs | all 4 received | any 1+ received |
| ICA | `ica_status === 'complete'` | `ica_status` is `in_progress` or `sent_for_signature` |
| MO | `mo_reg_received === 'yes'` | `mo_docs_submitted !== 'not_submitted'` |
| Equip | all 3 `yes` | any 1+ `yes` |
| Ins | `insurance_added_date` present | never partial |

### 3. Tooltip with sub-item checklist
Each node wraps in a `TooltipProvider`. Hovering shows a small card listing every field in that stage with a ✓ (green) or ✗ (muted) prefix and its human-readable value.

### 4. Remove the duplicate "Progress" column
The separate Progress column (currently hidden on smaller screens anyway) will be removed — the track replaces it. The % number moves to a small label at the end of the track row.

### Files to change
- `src/pages/staff/PipelineDashboard.tsx` — replace stage cell content, add `StageTrack` sub-component, remove/reduce Progress column, update column headers

No database changes needed. No new files needed.
