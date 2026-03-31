

## Fix QPassport Upload Error

### Changes to `src/pages/staff/OperatorDetailPanel.tsx`

1. **Line 172**: Change `upsert: false` → `upsert: true` to prevent double-click collision failures
2. **Lines 184-185**: Update catch block to extract error messages from Supabase plain objects (not just `Error` instances):

```ts
} catch (err: unknown) {
  const msg = err instanceof Error
    ? err.message
    : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as Record<string, unknown>).message)
      : 'Unknown error';
  toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
}
```

This surfaces the real storage/RLS error instead of "Unknown error", and eliminates a potential upload collision failure.

