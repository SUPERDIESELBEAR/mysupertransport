

## Fix: ICA "Execute Agreement" Button Stays Disabled After Drawing

### Root Cause

The "Execute Agreement" button on line 248 of `OperatorICASign.tsx` has this disabled check:

```tsx
disabled={signing || !signedName || sigRef.current?.isEmpty()}
```

Drawing on the canvas does **not** trigger a React re-render. So if Dominic types his name first (triggering a re-render where `isEmpty()` is still `true`), then draws his signature, the button **stays disabled** because no re-render occurs after drawing. The `isEmpty()` value is stale.

This is order-dependent:
- Draw first, then type name → works (typing triggers re-render, isEmpty() is now false)
- Type name first, then draw → **broken** (button stays disabled forever)

### Fix

**1. Add `onEnd` callback to SignatureCanvas** (`ICADocumentView.tsx`)

Pass an `onEnd` prop to `SignatureCanvas` that notifies the parent when a stroke finishes. This requires a new callback prop on `ICADocumentView`.

**2. Track drawing state in `OperatorICASign.tsx`**

Add a `hasDrawn` boolean state. Set it `true` via the `onEnd` callback. Reset it when "Clear signature" is pressed. Replace `sigRef.current?.isEmpty()` in the disabled check with `!hasDrawn`.

**3. Reset `hasDrawn` on clear**

Wire up the "Clear signature" button to also reset `hasDrawn` to `false`.

### Files changed

| File | Change |
|------|--------|
| `src/components/ica/ICADocumentView.tsx` | Add `onSignatureEnd` optional prop; pass it as `onEnd` to `SignatureCanvas`; wire "Clear" button to also call an `onSignatureClear` callback |
| `src/components/operator/OperatorICASign.tsx` | Add `hasDrawn` state; pass callbacks to `ICADocumentView`; replace `sigRef.current?.isEmpty()` with `!hasDrawn` in the disabled prop |

### Why the previous fix didn't help

The previous fix (removing ResizeObserver) was correct — it prevented the canvas from being cleared by keyboard-triggered resizes. But this second bug is independent: the button's disabled state simply never updates after the user draws because canvas strokes don't cause React re-renders.

