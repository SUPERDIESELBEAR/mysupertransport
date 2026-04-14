

## Fix: DocumentEditor Calls `onClose()` Before `onSave` Completes

### Root Cause
In `DocumentEditor.tsx` (line 240), `onSave?.(newUrl)` is called **without `await`**, and then `onClose()` is called on line 250. This means:

1. `onSave` starts (async) — triggers the `DocRow` handler which awaits `onSaved` (the DB update)
2. `onClose()` fires immediately — unmounts the editor
3. The DB update from step 1 gets interrupted or silently fails

The previous fix in `DocRow.tsx` (awaiting `onSaved`) was correct but ineffective because the problem is one layer deeper: `DocumentEditor` itself never awaits `onSave`.

### Fix — One line change

**`src/components/shared/DocumentEditor.tsx` (line 240)**

Change:
```typescript
onSave?.(newUrl);
```
To:
```typescript
await onSave?.(newUrl);
```

And remove the separate `onClose()` call on line 250, since the `DocRow` handler already calls `setShowEditor(false)` after the DB update completes. Alternatively, keep `onClose()` but only after the await.

### Files changed
| File | Change |
|------|--------|
| `src/components/shared/DocumentEditor.tsx` | `await onSave?.(newUrl)` on line 240; remove or move `onClose()` after await |

### Why this is the actual fix
- The storage upload succeeds (confirmed by "Document saved" toast)
- The `onSaved` DB update in `OperatorDetailPanel.tsx` is correct
- The `DocRow.tsx` await logic is correct
- The only remaining gap is `DocumentEditor` not awaiting the async `onSave` callback before calling `onClose()`

