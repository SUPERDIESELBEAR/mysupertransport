

## Remove PE Screening Gate from ICA / Stage 3

### What changes

Operators can now progress to Stage 3 (ICA) once MVR/CH is approved, without waiting for PE Screening to clear. PE Clear remains a Stage 1 completion criterion in `pipeline_config` — Stage 1 won't show as "complete" until PE clears, but the operator still advances through stages independently.

### Changes

**1. Stage progression logic** — two files have identical `computeStage()` functions

In both `PipelineDashboard.tsx` (line 437) and `BulkMessageModal.tsx` (line 75), change the Stage 3 gate from:
```
if (os.pe_screening_result === 'clear') return 'Stage 3 — ICA';
```
to:
```
if (os.mvr_ch_approval === 'approved') return 'Stage 3 — ICA';
```
And remove the now-redundant Stage 2 line (`if (os.mvr_ch_approval === 'approved') return 'Stage 2 — Documents'`), since Stage 2 → Stage 3 transition is now the same condition. The new logic becomes:

```text
Stage 6 ← insurance_added_date
Stage 5 ← all equipment yes
Stage 4 ← ica_status complete
Stage 3 ← mvr_ch_approval approved
Stage 2 ← (removed — folded into Stage 3)
Stage 1 ← default
```

Wait — that collapses Stage 2 entirely. The intent is that Stage 2 (Documents) still exists as a visible stage while docs are being collected. The correct fix is simpler: just remove the PE gate so Stage 2 flows into Stage 3 based on document completion rather than PE result. Let me re-examine.

Actually, the current cascade is: once MVR/CH approved → Stage 2, then once PE clear → Stage 3. To decouple PE from Stage 3 progression, we need a different Stage 2 → Stage 3 boundary. The simplest approach: once MVR/CH is approved AND Stage 2 docs are at least partially underway, the operator should be in Stage 2. Once staff is ready to send ICA (regardless of PE), they move to Stage 3. Since ICA status tracks this (`not_issued` → `in_progress` → `sent_for_signature` → `complete`), we can use ICA status itself:

```text
Stage 3 ← ica_status is 'in_progress' OR 'sent_for_signature' (and not yet complete)
Stage 2 ← mvr_ch_approval approved
Stage 1 ← default
```

This way: Stage 2 starts when BG checks approve, Stage 3 starts when staff begins preparing or sends the ICA, Stage 4 when ICA completes. PE is no longer a gate.

### Updated logic

```typescript
// Both PipelineDashboard.tsx and BulkMessageModal.tsx
function computeStage(os) {
  if (os.insurance_added_date) return 'Stage 6 — Insurance';
  if (os.decal_applied === 'yes' && os.eld_installed === 'yes' && os.fuel_card_issued === 'yes') return 'Stage 5 — Equipment';
  if (os.ica_status === 'complete') return 'Stage 4 — MO Registration';
  if (os.ica_status === 'in_progress' || os.ica_status === 'sent_for_signature') return 'Stage 3 — ICA';
  if (os.mvr_ch_approval === 'approved') return 'Stage 2 — Documents';
  return 'Stage 1 — Background';
}
```

**2. Warning banner** in `OperatorDetailPanel.tsx` (lines 4260-4264)

Replace the blocking amber warning with a soft informational note:
```tsx
{status.pe_screening_result !== 'clear' && (
  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
    ℹ️ PE Screening is still pending. You may proceed with the ICA.
  </div>
)}
```

**3. Pipeline config** — no changes. PE Clear stays as a Stage 1 completion criterion in the database.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Update `computeStage()`: Stage 3 triggered by ICA in-progress/sent instead of PE clear |
| `src/components/staff/BulkMessageModal.tsx` | Same `computeStage()` update |
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace blocking PE warning with informational note |

