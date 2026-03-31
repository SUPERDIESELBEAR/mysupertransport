

## Fix Stage 1 Progress Mismatch (evalItem Pipe Support)

### Problem
Stage 1's MVR and CH items show incorrect progress because `evalItem` does exact matching against `"requested"`, but those fields advance to `"received"`. No other stages are affected — their complete values are terminal.

### Changes

**1. `src/pages/staff/PipelineDashboard.tsx` — Enhance `evalItem`**
Add pipe-separated value support so `"requested|received"` matches either state:

```ts
if (completeValue.includes('|')) {
  return completeValue.split('|').some(v => raw === v);
}
```

**2. Database migration — Update Stage 1 config**
Update `pipeline_config` for stage `bg`:
- `mvr_status` complete_value: `"requested"` → `"requested|received"`
- `ch_status` complete_value: `"requested"` → `"requested|received"`

**3. `src/components/management/PipelineConfigEditor.tsx` — Add hint**
Add a small help note that pipe-separated values are supported (e.g., `"requested|received"`).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Pipe-separated matching in `evalItem` |
| DB migration | Update 2 `pipeline_config` rows |
| `src/components/management/PipelineConfigEditor.tsx` | Tooltip about pipe syntax |

