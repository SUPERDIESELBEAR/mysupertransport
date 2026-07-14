## The bug

The Pipeline Dashboard's stage tracker is driven by the `pipeline_config` table. The PE (Stage 6) row in that table is misconfigured, which is why the PE dot never turns green even when Stage 6 clearly shows "PE Clear" on the operator profile.

Two concrete problems in `pipeline_config`:

1. **PE stage — broken `Receipt Uploaded` item.** It uses `complete_value = "__present__"`, but the evaluator (`evalItem` in `PipelineDashboard.tsx`) only recognizes the sentinel `"present"`. So `pe_receipt_url` is never counted as done. Result: even when the operator's result is Clear, only 2 of 3 items evaluate true → the dot renders as `partial` (gold), never `complete` (green).

2. **PE stage — `PE Scheduled` too narrow.** It checks `pe_screening = 'scheduled'` only. Once staff move the operator forward to `results_in` or the result is set to `clear`, the "Scheduled" item flips back to false and the dot regresses.

3. **Background (BG) stage — stray PE item.** The BG stage config includes a `PE Screening Clear` item pointing at `pe_screening_result`. This bleeds PE completion into Background Check, so BG never turns fully green until PE is clear, which is why upstream stages also look out of sync.

Confirmed against live data: many operators have `pe_screening_result = 'clear'` while `pe_screening = 'scheduled'` and `pe_receipt_url` is null — exactly the shape that trips both bugs.

## The fix

Single migration that rewrites the two affected `pipeline_config` rows so they match how `OperatorDetailPanel` already evaluates PE completion (`pe_screening_result = 'clear'`):

- **BG stage:** drop the `pe_clear` item entirely. BG is complete when MVR/CH are approved.
- **PE stage:** rewrite items to:
  - `PE Scheduled` — true when `pe_screening IN ('scheduled','results_in')` OR `pe_screening_result = 'clear'` (so it stays checked as the operator advances).
  - `PE Result Clear` — true when `pe_screening_result = 'clear'`.
  Removes the broken `pe_receipt` item. This mirrors the profile-level logic exactly, so the Pipeline dot and the Stage 6 card can no longer disagree.

No frontend code changes required — `computeStageNodesFromConfig` already reads from `pipeline_config` and supports the `|` OR syntax used above.

### Technical detail

Migration:
```sql
-- BG: remove misplaced PE item
UPDATE pipeline_config
SET items = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(items) elem
  WHERE elem->>'key' <> 'pe_clear'
)
WHERE stage_key = 'bg';

-- PE: align with OperatorDetailPanel's completion logic
UPDATE pipeline_config
SET items = '[
  {
    "key": "pe_scheduled",
    "label": "PE Scheduled",
    "field": "pe_screening",
    "complete_value": "scheduled|results_in|clear"
  },
  {
    "key": "pe_clear",
    "label": "Result Clear",
    "field": "pe_screening_result",
    "complete_value": "clear"
  }
]'::jsonb
WHERE stage_key = 'pe';
```

Note: `evalItem` treats `pe_screening = 'clear'` as never true in practice (the column holds `not_started`/`scheduled`/`results_in`), but including `clear` in the OR keeps the item resilient if a future migration collapses those states.

### Verification

After apply, for any operator with `pe_screening_result = 'clear'` the PE node on the Pipeline card must render green (`state = 'complete'`) and the overall progress % on their card must recompute upward, matching the "PE Clear" badge already shown on the profile. Spot-check Delease Carter and the other operators listed in the earlier read (all currently show `pe_screening_result = 'clear'` with `pe_screening = 'scheduled'`).