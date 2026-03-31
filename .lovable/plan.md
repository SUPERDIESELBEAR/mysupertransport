

## Fix: Stage Data Not Persisting After Save

### Root Cause

The `handleSave` function in `OperatorDetailPanel.tsx` has a critical bug: **the `onboarding_status` update error is silently discarded**.

```text
Lines 1105-1117 (current):

1. operators.notes update → error captured in `error` variable ✓
2. onboarding_status update → error IGNORED (result not stored) ✗

Lines 1125-1128:
3. Only checks `operators.notes` error → shows "Saved successfully"

Line 1280:
4. savedSnapshot updated regardless → dirty-check thinks data is clean
```

So when the `onboarding_status` update fails for any reason (RLS, type mismatch, constraint violation), the user sees "Saved successfully", the local snapshot is overwritten with the unsaved values, and no unsaved-changes warning fires. When they navigate away and return, the data is fetched fresh from the database — which still has the old values.

### Fix

**File: `src/pages/staff/OperatorDetailPanel.tsx`**

1. **Capture the onboarding_status update error** — store the result of the `.update()` call on line 1114
2. **Check both errors before declaring success** — only show "Saved successfully" and update `savedSnapshot` if both the `operators` and `onboarding_status` updates succeeded
3. **Show the real error if onboarding_status fails** — display the error message in the toast so the underlying cause is visible
4. **Do not update `savedSnapshot` on failure** — this ensures the dirty-check still shows unsaved changes and the user gets a navigation warning

```text
Before:
  await supabase.from('onboarding_status').update(updateData).eq('id', statusId);
  // error silently dropped
  ...
  if (error) { show error } else { show success }
  savedSnapshot.current = { status, notes };  // always runs

After:
  const { error: statusError } = await supabase.from('onboarding_status').update(updateData).eq('id', statusId);
  ...
  if (error || statusError) {
    show combined error message
    setSaving(false);
    return;          // ← early exit, snapshot NOT updated
  }
  show success
  savedSnapshot.current = { status, notes };  // only on success
```

### Files Changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Capture onboarding_status update error, gate success toast + snapshot on both updates succeeding |

