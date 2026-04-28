## Sync Added to Insurance Date → Go-Live Date (one-way)

When staff sets the **Added to Insurance Date** in Stage 6, the **Go-Live Date** in Stage 7 will auto-fill with the same date if Go-Live is currently empty. Setting/changing Go-Live by itself does not affect the insurance date. If Go-Live already has a value, the insurance date will not overwrite it (no surprises for staff who deliberately picked a different go-live).

### File
`src/pages/staff/OperatorDetailPanel.tsx`

### Changes

1. **Stage 6 insurance date `onChange` (line ~5710):**
   Update the handler so that, when a value is set:
   - Always write `insurance_added_date` (existing behavior).
   - Additionally, if `status.go_live_date` is null/empty, also write `go_live_date = v` via `updateStatus('go_live_date', v)`.
   - Auto-collapse Stage 6 (existing behavior); also auto-collapse Stage 7 since it will now be complete.

2. **Toast feedback:**
   When Go-Live is auto-filled, show a small toast: "Go-Live Date set to match Insurance Date" so staff understand what happened. They can still edit Go-Live manually in Stage 7 afterward.

3. **No backfill of existing rows.**
   This only applies going forward when staff edits the insurance date. Operators already onboarded keep whatever values they have.

### Pseudocode (Stage 6 DateInput)
```tsx
onChange={v => {
  updateStatus('insurance_added_date', v || null);
  if (v) {
    // Auto-fill Go-Live only if empty
    if (!status.go_live_date) {
      updateStatus('go_live_date', v);
      toast({ title: 'Go-Live Date set', description: 'Auto-filled from Insurance Date.' });
    }
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.add('stage6');
      if (!status.go_live_date || status.go_live_date === v) next.add('stage7');
      return next;
    });
  }
}}
```

### Out of scope
- No DB schema changes.
- No changes to Stage 7's manual Go-Live editor — it remains fully independent.
- No changes to audit/email logic; both fields already log via existing diff capture (lines 1285–1294, 1602).