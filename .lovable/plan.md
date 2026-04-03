

## Fix: Wire ICA Sign View into OperatorPortal

### Problem
The `OperatorICASign` component is imported but never rendered. When the operator taps "Sign Your ICA Agreement", `setView('ica')` fires but no JSX block matches `view === 'ica'`, so nothing appears.

### Change

**`src/pages/operator/OperatorPortal.tsx`** — Add the missing render block after the "My Truck" view (after line 1123):

```tsx
{/* ── ICA SIGN VIEW ── */}
{view === 'ica' && <OperatorICASign />}
```

One line. The component already handles everything internally (fetching the contract, displaying it, signature pad, submission).

### Files changed

| File | Change |
|------|--------|
| `src/pages/operator/OperatorPortal.tsx` | Add `{view === 'ica' && <OperatorICASign />}` after line 1123 |

