

## Fix: Await `onSaved` Before Closing Editor

### Problem
In `DocRow.tsx` (line 550-552), the editor's `onSave` handler calls `setShowEditor(false)` **before** invoking `onSaved?.(newUrl)`. This closes the editor immediately, triggering a React re-render that can interrupt the async database update in `OperatorDetailPanel.tsx`. The result: the upload succeeds but the database record is never updated, so the original image reappears.

### Changes

**1. `src/components/inspection/DocRow.tsx` (lines 550-553)**

Change the `onSave` callback to await `onSaved` before closing:

```typescript
onSave={async (newUrl) => {
  if (onSaved) {
    try {
      await onSaved(newUrl);
    } catch (err) {
      console.error('onSaved callback error:', err);
    }
  }
  setShowEditor(false);
}}
```

**2. `src/pages/staff/OperatorDetailPanel.tsx` (lines 5855-5878)**

Wrap the `onSaved` body in try/catch for error visibility:

```typescript
onSaved={stage2Preview.appField ? async (newUrl: string) => {
  try {
    const field = stage2Preview.appField!;
    const appId = applicationData?.id;
    if (!appId) {
      toast({ title: 'No application record found', variant: 'destructive' });
      return;
    }
    // ... existing extraction and DB update logic (unchanged) ...
  } catch (err: any) {
    console.error('onSaved error:', err);
    toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
  }
} : undefined}
```

### Why this is the final fix
- The storage upload and RLS policies are now correct (confirmed by "Document saved" toast)
- The only remaining issue is timing: the editor unmounts before the DB update runs
- Awaiting `onSaved` ensures the database write completes while the component is still mounted

