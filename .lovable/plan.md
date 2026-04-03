

## Fix: Navigate Away After ICA Execution

### Problem
After the operator signs the ICA and clicks "Execute Agreement," the contract updates successfully but the app stays on the same screen with the signing UI still visible. The user expects a clear transition — confirmation feedback and navigation to the next logical screen.

### What changes

**`src/components/operator/OperatorICASign.tsx`**
- After successful signing (line 176-177), instead of just showing a toast and re-fetching the contract, also call a new `onComplete` callback prop.

**`src/pages/operator/OperatorPortal.tsx`**
- Pass an `onComplete` callback to `OperatorICASign` that:
  1. Refreshes the onboarding status (so the checklist reflects ICA complete)
  2. Navigates the operator to the **Status** (home/checklist) view so they see their updated progress

### Flow after fix
1. Operator taps "Execute Agreement"
2. Signing completes, toast confirms success
3. App automatically navigates to the Status/Home view
4. The onboarding checklist shows ICA as complete (green check)
5. The ICA tab remains accessible (read-only, showing the executed document) but is no longer the active view

### Files changed

| File | Change |
|------|--------|
| `src/components/operator/OperatorICASign.tsx` | Add optional `onComplete` prop; call it after successful signing |
| `src/pages/operator/OperatorPortal.tsx` | Pass `onComplete` to `OperatorICASign` that refreshes onboarding status and sets view to `'status'` |

